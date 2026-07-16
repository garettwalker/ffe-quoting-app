import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findInvoice } from "@/lib/invoice-calculations";
import type { InvoiceData, InvoiceKind } from "@/lib/types";

// Server-only Stripe payment ledger helpers, used by the webhook
// (app/api/stripe-webhook/route.ts). All writes go through the service-role
// client (the webhook has no user session and the tables are admin-only under
// RLS), which bypasses RLS. The manual Mark Paid button (client-side) does NOT
// use these — it writes its own manual row directly.

export type PaymentMethod = "card" | "ach_debit" | "manual";
export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded";

type QuoteRow = { quote_id: string; invoice_data: InvoiceData | null };

// Read the live invoice amount for a quote + kind from the DB. The amount shown
// to the customer and charged is always this DB value, never anything Stripe
// sends — so a tampered session or replayed event can never charge the wrong
// amount. Returns exists=false when the quote / invoice setup / that invoice
// kind can't be found.
export async function readInvoiceAmount(
  quoteUuid: string,
  kind: InvoiceKind
): Promise<{ exists: boolean; amountCents: number }> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("quotes")
    .select("invoice_data")
    .eq("id", quoteUuid)
    .single();
  const row = result.data as QuoteRow | null;
  if (!row || !row.invoice_data) return { exists: false, amountCents: 0 };
  const invoice = findInvoice(row.invoice_data, kind);
  if (!invoice) return { exists: false, amountCents: 0 };
  return { exists: true, amountCents: Math.round(invoice.amountCents) || 0 };
}

// Upsert a Stripe payment ledger row keyed by the Stripe payment intent id, so
// the first event for a payment creates the row and later events (processing ->
// succeeded -> refunded) update it. Returns the resulting status (the unique
// index on stripe_payment_intent_id is the conflict target).
export async function upsertStripePayment(input: {
  quoteUuid: string;
  kind: InvoiceKind;
  amountCents: number;
  method: PaymentMethod;
  status: PaymentStatus;
  stripePaymentIntentId: string;
  stripeSessionId: string | null;
  paidAt: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("payments")
    .upsert(
      {
        quote_id: input.quoteUuid,
        invoice_kind: input.kind,
        amount_cents: input.amountCents,
        method: input.method,
        status: input.status,
        stripe_payment_intent_id: input.stripePaymentIntentId,
        stripe_session_id: input.stripeSessionId,
        recorded_by: "stripe",
        paid_at: input.paidAt
      },
      { onConflict: "stripe_payment_intent_id" }
    );
  if (error) {
    throw new Error(`upsertStripePayment failed: ${error.message}`);
  }
}

// Update an existing payment row's status by its Stripe payment intent id
// (used by payment_intent.* and charge.refunded events). Sets paid_at when the
// new status is succeeded. Returns the row's quote + kind so the caller can flip
// the invoice flag, or null when no matching row exists yet (the
// checkout.session.completed event usually arrives first and creates the row;
// if a later event beats it, that first event will still finish the job).
export async function updatePaymentStatus(
  stripePaymentIntentId: string,
  status: PaymentStatus
): Promise<{ quoteUuid: string; kind: InvoiceKind } | null> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { status };
  if (status === "succeeded") patch.paid_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("payments")
    .update(patch)
    .eq("stripe_payment_intent_id", stripePaymentIntentId)
    .select("quote_id, invoice_kind")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { quote_id: string; invoice_kind: InvoiceKind };
  return { quoteUuid: row.quote_id, kind: row.invoice_kind };
}

// Double-payment guard. Returns true when there is an active (non-terminal)
// payment for this invoice in the ledger: one that is still processing, pending,
// or already succeeded. /api/create-checkout-session calls this BEFORE creating
// a new Stripe session and refuses if it returns true, so a customer can't be
// charged twice on one invoice. This matters most in live mode: an ACH payment
// sits "processing" for 1-3 business days while the invoice flag is still unpaid
// (the flag only flips on payment_intent.succeeded, which arrives days later),
// so without this guard a customer who reopens the link could pay again. A
// failed/refunded/cancelled payment does NOT count: those are terminal and the
// customer is allowed to retry. Fail-open on a read error (the primary guard is
// the invoice paid flag, which is checked separately and reliably; a transient
// ledger read failure in this narrow window is near-impossible and failing open
// avoids blocking a legitimate customer).
export async function hasActivePayment(
  quoteUuid: string,
  kind: InvoiceKind
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .eq("quote_id", quoteUuid)
    .eq("invoice_kind", kind)
    .in("status", ["processing", "pending", "succeeded"])
    .limit(1);
  if (error) {
    console.error(
      "[payments] hasActivePayment read failed, failing open",
      quoteUuid,
      kind,
      error.message
    );
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

// Flip one invoice's paid flag in quotes.invoice_data (the UI source of truth).
// Idempotent: setting "paid" twice is harmless. `paid=false` reverses it (used
// on refund). Reads the live invoice_data, updates just the matching invoice's
// status + paidAt, writes the whole object back.
export async function setInvoicePaid(
  quoteUuid: string,
  kind: InvoiceKind,
  paid: boolean
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("quotes")
    .select("invoice_data")
    .eq("id", quoteUuid)
    .single();
  const row = result.data as QuoteRow | null;
  if (!row || !row.invoice_data) {
    throw new Error(`setInvoicePaid: invoice_data not found for ${quoteUuid}`);
  }
  const invoiceData = row.invoice_data;
  const now = new Date().toISOString();
  const invoices = invoiceData.invoices.map((invoice) =>
    invoice.kind === kind
      ? {
          ...invoice,
          status: (paid ? "paid" : "unpaid") as "paid" | "unpaid",
          paidAt: paid ? now : null
        }
      : invoice
  );
  const nextData: InvoiceData = { ...invoiceData, invoices };
  const { error } = await supabase
    .from("quotes")
    .update({ invoice_data: nextData, updated_at: now })
    .eq("id", quoteUuid);
  if (error) {
    throw new Error(`setInvoicePaid update failed: ${error.message}`);
  }
}

// Record that a Stripe event was processed (audit / idempotency log). Best
// effort — called AFTER the handler succeeds, so a logging failure never
// causes a retry of already-applied work (the handler's writes are idempotent
// anyway). A duplicate event id (re-delivery) is a no-op.
export async function recordWebhookEvent(
  eventId: string,
  eventType: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .insert({ stripe_event_id: eventId, event_type: eventType });
  if (error && error.code !== "23505") {
    // 23505 = unique violation (event already recorded); anything else is
    // unexpected but should not fail the request.
    throw new Error(`recordWebhookEvent failed: ${error.message}`);
  }
}