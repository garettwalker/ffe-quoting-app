// Server-only report loader. Flattens every quote into report events:
//   - one quote event for the pipeline (quoted / accepted)
//   - one receivable invoice event per billed invoice
//   - one settled payment event per payment, so collections land in the month
//     the money actually arrived.
// The client report views only ever filter and aggregate this flat dataset, so
// the headline numbers, charts, and tables cannot disagree.

import { loadInvoiceReceipts, type InvoiceReceipts } from "@/lib/email-log";
import {
  invoiceIsReceivable,
  invoiceOutstandingCents,
  invoicePaidCents
} from "@/lib/invoice-calculations";
import { getSupabaseServer } from "@/lib/supabase-server";
import { normalizeQuoteType } from "@/lib/types";
import type {
  InvoiceData,
  InvoiceKind,
  QuoteCalculationResult,
  QuoteFormState,
  QuoteType
} from "@/lib/types";
import type {
  ReportDataset,
  ReportInvoice,
  ReportPayment,
  ReportQuote
} from "@/lib/reports";

// High enough to cover the full book for a long time. The page warns when the
// cap is reached so the totals are never silently truncated.
const REPORT_LIMIT = 500;
const PAYMENT_LIMIT = 10_000;

type ReportQuoteRow = {
  id: string;
  quote_id: string;
  status: string;
  quote_type: string | null;
  project_type: string | null;
  client_name: string | null;
  created_at: string;
  quote_data: QuoteFormState | null;
  calculation_data: QuoteCalculationResult | null;
  invoice_data: InvoiceData | null;
};

type PaymentRow = {
  quote_id: string | null;
  invoice_kind: InvoiceKind | null;
  amount_cents: number | null;
  method: string | null;
  paid_at: string | null;
  created_at: string | null;
};

function projectTypeFor(row: ReportQuoteRow, quoteType: QuoteType): string {
  if (row.project_type && row.project_type.trim()) return row.project_type;
  const fromQuote = row.quote_data?.projectType;
  if (fromQuote && fromQuote.trim()) return fromQuote;
  if (quoteType === "service_call") return "Service call";
  if (quoteType === "direct_invoice") return "Direct invoice";
  return "New build";
}

function customerFor(row: ReportQuoteRow): string {
  return (
    (row.client_name && row.client_name.trim()) ||
    (row.quote_data?.clientName && row.quote_data.clientName.trim()) ||
    "Unnamed customer"
  );
}

function quoteDateFor(row: ReportQuoteRow): string {
  return row.quote_data?.quoteDate || row.created_at;
}

export async function getReportDataset(): Promise<ReportDataset> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, status, quote_type, project_type, client_name, created_at, quote_data, calculation_data, invoice_data"
    )
    .order("created_at", { ascending: false })
    .limit(REPORT_LIMIT);

  if (error) {
    throw new Error(`Could not load report data: ${error.message}`);
  }

  const rows = (data ?? []) as ReportQuoteRow[];
  const ids = rows.map((row) => row.id);

  const receiptsMap = ids.length
    ? await loadInvoiceReceipts(ids)
    : new Map<string, InvoiceReceipts>();

  // The payments table is small and every settled row is worth having; read it
  // once, then keep only rows for quotes in this dataset.
  const paymentResult = await supabase
    .from("payments")
    .select("quote_id, invoice_kind, amount_cents, method, paid_at, created_at")
    .eq("status", "succeeded")
    .limit(PAYMENT_LIMIT);
  const paymentRows = (paymentResult.data ?? []) as PaymentRow[];

  const quoteIdSet = new Set(rows.map((row) => row.id));
  const payments: ReportPayment[] = [];
  const ledgerByInvoice = new Map<string, number>();

  for (const payment of paymentRows) {
    if (!payment.quote_id || !quoteIdSet.has(payment.quote_id)) continue;
    const amount = Math.max(0, Math.round(payment.amount_cents ?? 0));
    if (amount <= 0) continue;
    const paidAt = payment.paid_at || payment.created_at;
    if (!paidAt) continue;
    payments.push({
      quoteId: payment.quote_id,
      amountCents: amount,
      paidAt,
      method: payment.method || "manual"
    });
    if (payment.invoice_kind) {
      const key = `${payment.quote_id}:${payment.invoice_kind}`;
      ledgerByInvoice.set(key, (ledgerByInvoice.get(key) ?? 0) + amount);
    }
  }

  const quotes: ReportQuote[] = [];
  const invoices: ReportInvoice[] = [];

  for (const row of rows) {
    const quoteType = normalizeQuoteType(row.quote_type);
    const customer = customerFor(row);
    const projectType = projectTypeFor(row, quoteType);
    const quotedCents = Math.max(
      0,
      Math.round(row.calculation_data?.clientQuoteTotalCents ?? 0)
    );

    quotes.push({
      quoteId: row.id,
      customer,
      projectType,
      quoteType,
      status: row.status,
      quotedCents,
      createdAt: quoteDateFor(row)
    });

    const data = row.invoice_data;
    if (!data || !Array.isArray(data.invoices) || data.invoices.length === 0) {
      continue;
    }

    const receipts =
      receiptsMap.get(row.id) ?? { initial: null, finish: null, service: null };

    for (const invoice of data.invoices) {
      if (!invoiceIsReceivable(invoice, invoice.kind, receipts)) continue;
      const amountCents = Math.max(0, Math.round(invoice.amountCents ?? 0));
      if (amountCents <= 0) continue;

      const receivableAt =
        receipts[invoice.kind] ||
        invoice.paidAt ||
        invoice.issuedAt ||
        quoteDateFor(row);

      const paidCents = invoicePaidCents(invoice);
      const outstandingCents = invoiceOutstandingCents(invoice);

      invoices.push({
        quoteId: row.id,
        customer,
        projectType,
        quoteType,
        kind: invoice.kind,
        amountCents,
        paidCents,
        outstandingCents,
        receivableAt
      });

      // Legacy invoices paid before the payments ledger existed have no row
      // here. Add the unaccounted difference on its paid date so collected
      // totals still match the invoice.
      const ledger = ledgerByInvoice.get(`${row.id}:${invoice.kind}`) ?? 0;
      const missing = paidCents - ledger;
      if (missing > 0) {
        payments.push({
          quoteId: row.id,
          amountCents: missing,
          paidAt: invoice.paidAt || receivableAt,
          method: "legacy"
        });
      }
    }
  }

  return {
    quotes,
    invoices,
    payments,
    capped: rows.length >= REPORT_LIMIT,
    generatedAt: new Date().toISOString()
  };
}
