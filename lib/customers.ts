import { getSupabaseServer } from "@/lib/supabase-server";
import type { Customer, CustomerEmail, InvoiceData, QuoteStatus } from "@/lib/types";
import { normalizeStatus } from "@/lib/types";
import {
  outstandingCents,
  receivableInvoicedCents
} from "@/lib/invoice-calculations";
import { loadInvoiceReceipts, type InvoiceReceipts } from "@/lib/email-log";

// Server-only data layer for the customers repository. All reads go through
// the admin server client (RLS-enforced, admin-only after Phase C). The quote
// keeps its own client_name / client_email snapshot; a customer record is the
// re-usable, autofill source + the row behind the /customers view.
//
// Money figures (Quoted / Invoiced / Paid) reuse the SAME receivable model as
// /receivables (lib/invoice-calculations + lib/email-log) so the two views can
// never disagree: Invoiced = receivableInvoicedCents (a finish invoice that has
// never been emailed and isn't paid is "scheduled", not counted); Paid =
// Invoiced minus outstanding. Quote snapshots are point-in-time; only the
// customer_id link is shared.

// Coerce the raw JSONB `emails` array (typed as unknown from Supabase) into the
// CustomerEmail shape. Tolerates a missing array, a non-array, or entries that
// are strings instead of objects (defensive; the editor always writes objects).
export function normalizeCustomerEmails(raw: unknown): CustomerEmail[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomerEmail[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) out.push({ email: trimmed });
      continue;
    }
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const email = typeof obj.email === "string" ? obj.email.trim() : "";
      if (!email) continue;
      const label =
        typeof obj.label === "string" && obj.label.trim()
          ? obj.label.trim()
          : undefined;
      out.push(label ? { email, label } : { email });
    }
  }
  return out;
}

type CustomerRow = {
  id: string;
  name: string;
  emails: unknown;
  phone: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function normalizeCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    emails: normalizeCustomerEmails(row.emails),
    phone: row.phone,
    note: row.note,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// All customers, alphabetical by name. Used by the quote-builder picker (the
// server page fetches and passes the list down) and the /customers list page.
export async function getCustomers(): Promise<Customer[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, emails, phone, note, active, created_at, updated_at"
    )
    .order("name");
  if (error || !data) return [];
  return (data as CustomerRow[]).map(normalizeCustomer);
}

// A single customer. Returns null when not found. Used by the customer detail
// page and to load a linked customer's emails for the email To-field datalist.
export async function getCustomer(id: string): Promise<Customer | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, emails, phone, note, active, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeCustomer(data as CustomerRow);
}

// The linked customer's email list for a quote, for the email To-field datalist.
// Reads the quotes.customer_id column (the source of truth, set by backfill and
// by the builder) then loads the customer's emails. Empty when the quote has no
// linked customer (a one-off quote or a backfilled quote whose customer was
// removed). Lightweight: one small query plus one lookup.
export async function getCustomerEmailsForQuote(
  quoteId: string
): Promise<string[]> {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("quotes")
    .select("customer_id")
    .eq("id", quoteId)
    .maybeSingle();
  const customerId = (data as { customer_id: string | null } | null)
    ?.customer_id;
  if (!customerId) return [];
  const customer = await getCustomer(customerId);
  if (!customer) return [];
  return customer.emails.map((e) => e.email).filter(Boolean);
}

// One customer's quotes for the detail page, newest first. Mirrors the fields
// the saved-quote / dashboard rows use so the detail list links cleanly. Each
// job carries its own Quoted (clientQuoteTotalCents) / Invoiced / Paid figures
// using the shared receivable model, so the detail page can show a money band
// and per-job breakdown that ties out to /receivables.
export type CustomerQuoteSummary = {
  id: string;
  quoteId: string;
  status: QuoteStatus;
  projectName: string | null;
  clientName: string;
  clientQuoteTotalCents: number;
  invoicedCents: number;
  paidCents: number;
  createdAt: string;
};

export async function getCustomerQuotes(
  customerId: string
): Promise<CustomerQuoteSummary[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, status, project_name, client_name, client_quote_total_cents, invoice_data, created_at"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as Array<{
    id: string;
    quote_id: string;
    status: string;
    project_name: string | null;
    client_name: string;
    client_quote_total_cents: number;
    invoice_data: InvoiceData | null;
    created_at: string;
  }>;
  // One batched query for every job's emailed-invoice state, so a not-yet-
  // emailed finish is "scheduled" (excluded from Invoiced/Paid) exactly as in AR.
  const receiptsMap = await loadInvoiceReceipts(rows.map((row) => row.id));
  return rows.map((row) => {
    const receipts = receiptsMap.get(row.id) ?? { initial: null, finish: null };
    const money = computeQuoteMoney(
      row.client_quote_total_cents,
      row.invoice_data,
      receipts
    );
    return {
      id: row.id,
      quoteId: row.quote_id,
      status: normalizeStatus(row.status),
      projectName: row.project_name,
      clientName: row.client_name,
      clientQuoteTotalCents: money.quotedCents,
      invoicedCents: money.invoicedCents,
      paidCents: money.paidCents,
      createdAt: row.created_at
    };
  });
}

// Per-quote Quoted / Invoiced / Paid. Quoted = the quote total; Invoiced = the
// receivable invoiced amount (finish counts only once emailed or paid); Paid =
// Invoiced minus outstanding. A draft / prepared quote (no invoice_data) is
// quoted only, with $0 invoiced and $0 paid. `receipts` is always a real object
// (empty when never emailed) so the receivable-aware branch runs.
export type QuoteMoney = {
  quotedCents: number;
  invoicedCents: number;
  paidCents: number;
};

function computeQuoteMoney(
  quoteTotalCents: number,
  invoiceData: InvoiceData | null,
  receipts: InvoiceReceipts
): QuoteMoney {
  const quotedCents = Math.round(quoteTotalCents) || 0;
  if (!invoiceData) {
    return { quotedCents, invoicedCents: 0, paidCents: 0 };
  }
  const invoicedCents = receivableInvoicedCents(invoiceData, receipts);
  const outstanding = outstandingCents(invoiceData, receipts);
  const paidCents = Math.max(0, invoicedCents - outstanding);
  return { quotedCents, invoicedCents, paidCents };
}

// Per-customer aggregate for the /customers list: how many quotes link here and
// the customer's total Quoted / Invoiced / Paid. One query across all linked
// quotes, folded in memory, with one batched receipts query for the emailed
// state. Ceiling at CUSTOMER_MONEY_LIMIT keeps the query bounded; if it's ever
// reached the totals would undercount, so `capped` is returned to warn the owner.
export type CustomerMoney = {
  quoteCount: number;
  quotedCents: number;
  invoicedCents: number;
  paidCents: number;
};

const CUSTOMER_MONEY_LIMIT = 2000;

export async function getCustomerMoney(): Promise<{
  byCustomer: Map<string, CustomerMoney>;
  capped: boolean;
}> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, customer_id, client_quote_total_cents, invoice_data")
    .not("customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(CUSTOMER_MONEY_LIMIT);
  const byCustomer = new Map<string, CustomerMoney>();
  if (error || !data) return { byCustomer, capped: false };
  const rows = data as Array<{
    id: string;
    customer_id: string | null;
    client_quote_total_cents: number;
    invoice_data: InvoiceData | null;
  }>;
  const capped = rows.length >= CUSTOMER_MONEY_LIMIT;
  const receiptsMap = await loadInvoiceReceipts(rows.map((row) => row.id));
  for (const row of rows) {
    if (!row.customer_id) continue;
    const receipts = receiptsMap.get(row.id) ?? { initial: null, finish: null };
    const money = computeQuoteMoney(
      row.client_quote_total_cents,
      row.invoice_data,
      receipts
    );
    const prev = byCustomer.get(row.customer_id) ?? {
      quoteCount: 0,
      quotedCents: 0,
      invoicedCents: 0,
      paidCents: 0
    };
    prev.quoteCount += 1;
    prev.quotedCents += money.quotedCents;
    prev.invoicedCents += money.invoicedCents;
    prev.paidCents += money.paidCents;
    byCustomer.set(row.customer_id, prev);
  }
  return { byCustomer, capped };
}