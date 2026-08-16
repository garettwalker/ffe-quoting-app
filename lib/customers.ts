import { getSupabaseServer } from "@/lib/supabase-server";
import type { Customer, CustomerEmail, QuoteStatus } from "@/lib/types";
import { normalizeStatus } from "@/lib/types";

// Server-only data layer for the customers repository. All reads go through
// the admin server client (RLS-enforced, admin-only after Phase C). The quote
// keeps its own client_name / client_email snapshot; a customer record is the
// re-usable, autofill source + the row behind the /customers view.

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
// the saved-quote / dashboard rows use so the detail list links cleanly.
export type CustomerQuoteSummary = {
  id: string;
  quoteId: string;
  status: QuoteStatus;
  projectName: string | null;
  clientName: string;
  clientQuoteTotalCents: number;
  createdAt: string;
};

export async function getCustomerQuotes(
  customerId: string
): Promise<CustomerQuoteSummary[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, status, project_name, client_name, client_quote_total_cents, created_at"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    quote_id: string;
    status: string;
    project_name: string | null;
    client_name: string;
    client_quote_total_cents: number;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    quoteId: row.quote_id,
    status: normalizeStatus(row.status),
    projectName: row.project_name,
    clientName: row.client_name,
    clientQuoteTotalCents: row.client_quote_total_cents,
    createdAt: row.created_at
  }));
}

// Per-customer aggregate for the /customers list: how many quotes link here and
// their total quoted dollars. One query across all quotes, folded in memory.
export type CustomerStats = {
  quoteCount: number;
  totalQuotedCents: number;
};

export async function getCustomerStatsMap(): Promise<
  Map<string, CustomerStats>
> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("quotes")
    .select("customer_id, client_quote_total_cents");
  const map = new Map<string, CustomerStats>();
  if (error || !data) return map;
  for (const row of data as Array<{
    customer_id: string | null;
    client_quote_total_cents: number;
  }>) {
    if (!row.customer_id) continue;
    const prev = map.get(row.customer_id) ?? {
      quoteCount: 0,
      totalQuotedCents: 0
    };
    prev.quoteCount += 1;
    prev.totalQuotedCents += row.client_quote_total_cents ?? 0;
    map.set(row.customer_id, prev);
  }
  return map;
}