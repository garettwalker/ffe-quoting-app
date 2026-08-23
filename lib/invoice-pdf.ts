import { formatCurrency } from "@/lib/currency";
import {
  computeInvoiceAmounts,
  findInvoice,
  invoiceDisplayNumber
} from "@/lib/invoice-calculations";
import { getLogoDataUri } from "@/lib/pdf-logo";
import { getSettings } from "@/lib/pricing";
import { getSupabaseServer } from "@/lib/supabase-server";
import type {
  InvoiceData,
  InvoiceKind,
  QuoteCalculationResult,
  QuoteFormState
} from "@/lib/types";
import type { InvoicePdfProps } from "@/components/pdf/invoice-document";

// Server-only helper shared by the printable invoice preview page
// (app/quotes/[id]/invoices/[kind]/print/page.tsx) and the PDF download route
// (app/quotes/[id]/invoices/[kind]/pdf/route.ts). Loads the saved quote row +
// invoice setup + live settings, resolves the requested invoice (initial or
// finish), and builds the plain, pre-formatted props the react-pdf document
// needs — all money/date/locale formatting happens here so the PDF component
// stays pure data-in and the preview and downloaded PDF can never drift apart.

type InvoiceQuoteRow = {
  id: string;
  quote_id: string;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult;
  invoice_data: InvoiceData | null;
};

export type InvoicePdfInput = {
  pdfProps: InvoicePdfProps;
  fileName: string;
};

// Returns null when the quote, its invoice setup, or the requested invoice
// kind can't be loaded, so callers can render their own not-found UI.
export async function loadInvoicePdfInput(
  id: string,
  kind: string
): Promise<InvoicePdfInput | null> {
  if (kind !== "initial" && kind !== "finish") return null;

  const supabase = getSupabaseServer();
  const [quoteResult, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_id, quote_data, calculation_data, invoice_data")
      .eq("id", id)
      .single(),
    getSettings()
  ]);

  const { data, error } = quoteResult;
  if (
    error ||
    !data ||
    !data.quote_data ||
    !data.calculation_data ||
    !data.invoice_data
  ) {
    return null;
  }

  const row = data as InvoiceQuoteRow;
  const quote = row.quote_data;
  const invoiceData = row.invoice_data as InvoiceData;
  const invoice = findInvoice(invoiceData, kind as InvoiceKind);
  if (!invoice) return null;

  const amounts = computeInvoiceAmounts(invoiceData);
  // The customer-facing identifier: the invoice's sequential number when it
  // has one (INV-NNNN), else the derived Q-...-R / -F reference for invoices
  // saved before the number field existed. Flows into the PDF header, the
  // download filename, the email subject, and the email_log reference.
  const reference = invoiceDisplayNumber(row.quote_id, invoice);
  const invoiceDateLabel = formatInvoiceDate(invoice.issuedAt ?? invoiceData.generatedAt);

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const title = kind === "initial" ? "Initial Invoice" : "Final Invoice";

  // When the rough-in is paid, its amount is locked and the finish absorbs
  // any later changes (see computeInvoiceAmounts). The initial invoice is a
  // historical record of what was collected, so label the rough-in line as
  // paid/locked rather than quoting a now-stale percentage of a contract
  // that may have been edited since.
  const roughInPaid = invoice.status === "paid";

  const lines =
    kind === "initial"
      ? [
          {
            label: roughInPaid
              ? "Rough-In (paid, locked)"
              : `Rough-In (${invoiceData.roughInPercent}% of contract)`,
            amount: formatCurrency(amounts.roughInAmountCents)
          },
          // Only show the permit fee line when there is one; a $0 permit fee
          // would just print "Permit Fee $0.00" as noise.
          ...(invoiceData.permitFeeCents > 0
            ? [
                {
                  label: "Permit Fee",
                  amount: formatCurrency(invoiceData.permitFeeCents)
                }
              ]
            : [])
        ]
      : [
          {
            label: "Final Invoice",
            amount: formatCurrency(amounts.finishAmountCents)
          }
        ];

  const previouslyInvoiced =
    kind === "finish"
      ? {
          previouslyInvoicedAmount: formatCurrency(amounts.initialInvoiceAmountCents),
          contractTotal: formatCurrency(invoiceData.contractAmountCents)
        }
      : null;

  // Scope-of-work line items shown on the invoice. Each line carries its
  // name, a customer-facing comment, a "qty x unit price" detail string, and
  // the line total — all money formatting pre-done here so the PDF component
  // stays data-in. The contract is the sum of these line totals; the charge
  // lines above bill the rough-in/finish split of that contract.
  //
  // The invoice's scope is INDEPENDENT of the quote: once invoicing is set up
  // the line items live on the invoice (invoice_data.scopeLines) and are
  // edited there, so the quote stays a point-in-time estimate. For invoices
  // set up before line items existed (no scopeLines on the row yet), fall back
  // to the quote's calculation_data.clientFacingLines so nothing breaks — and
  // the first time the owner re-saves the setup, the builder persists the
  // line items. The backfill is display-only (it does not change the stored
  // contractAmountCents, which legacy invoices keep as the hand-entered value).
  const scopeLines = Array.isArray(invoiceData.scopeLines)
    ? invoiceData.scopeLines.map((line) => {
        const totalCents = line.quantity * line.unitPriceCents;
        return {
          name: line.name,
          comment: line.comment,
          detail: `${line.quantity} × ${formatCurrency(line.unitPriceCents)}`,
          total: formatCurrency(totalCents)
        };
      })
    : row.calculation_data.clientFacingLines.map((line) => {
        const totalCents = line.quantity * line.clientUnitPriceCents;
        return {
          name: line.name,
          comment: line.comment,
          detail: `${line.quantity} × ${formatCurrency(line.clientUnitPriceCents)}`,
          total: formatCurrency(totalCents)
        };
      });

  const pdfProps: InvoicePdfProps = {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    reference,
    invoiceDateLabel,
    title,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    projectName: quote.projectName ?? "",
    fullAddress,
    projectType: quote.projectType,
    squareFootageLabel: `${quote.squareFootage.toLocaleString()} sq ft`,
    lines,
    scopeLines,
    previouslyInvoiced,
    amountDue: formatCurrency(invoice.amountCents),
    paymentTerms: settings.invoicePaymentTerms,
    logoDataUri: getLogoDataUri()
  };

  return {
    pdfProps,
    fileName: `invoice-${reference}.pdf`
  };
}

// Long-form date, e.g. "June 18, 2026". issuedAt / generatedAt are ISO
// timestamps; quoteDate-style ("YYYY-MM-DD") parsing is not needed here.
function formatInvoiceDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}