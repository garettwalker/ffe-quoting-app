import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  findInvoice,
  invoiceBalanceCents,
  withInvoicePaidCents
} from "@/lib/invoice-calculations";
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

// Stripe ACH (US bank account) per-payment cap on this account. Stripe shows
// this limit when you enable US bank account; it is account-specific and Stripe
// can raise it with more verification. We avoid offering ACH above this amount
// (see /api/create-checkout-session, which drops us_bank_account from the
// payment methods over the cap) so a customer never hits a mid-Checkout
// rejection, and the /pay page tells them why. Bump here if Stripe raises it.
export const ACH_LIMIT_CENTS = 20_000 * 100;

// ACH is offered only for positive amounts at or under the cap. Over the cap,
// only card is offered (plus the customer can always mail a check).
export function achAvailableForAmount(amountCents: number): boolean {
  return amountCents > 0 && amountCents <= ACH_LIMIT_CENTS;
}

type QuoteRow = { quote_id: string; invoice_data: InvoiceData | null };

// Read the live BALANCE for a quote + kind from the DB: the invoice amount less
// everything already collected on it. This is what the customer is shown and
// charged, so an invoice that already has a partial payment only ever takes the
// remainder. The amount always comes from here, never from Stripe or the
// browser, so a tampered session or replayed event can never charge the wrong
// amount. Returns exists=false when the quote / invoice setup / that kind can't
// be found.
export async function readInvoiceBalance(
  quoteUuid: string,
  kind: InvoiceKind
): Promise<{ exists: boolean; balanceCents: number }> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("quotes")
    .select("invoice_data")
    .eq("id", quoteUuid)
    .single();
  const row = result.data as QuoteRow | null;
  if (!row || !row.invoice_data) return { exists: false, balanceCents: 0 };
  const invoice = findInvoice(row.invoice_data, kind);
  if (!invoice) return { exists: false, balanceCents: 0 };
  return { exists: true, balanceCents: invoiceBalanceCents(invoice) };
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
// ONLINE payment for this invoice in the ledger: one that is still processing,
// pending, or already succeeded. /api/create-checkout-session calls this BEFORE
// creating a new Stripe session and refuses if it returns true, so a customer
// can't be charged twice on one invoice. This matters most in live mode: an ACH
// payment sits "processing" for 1-3 business days while the invoice flag is
// still unpaid (the flag only flips on payment_intent.succeeded, which arrives
// days later), so without this guard a customer who reopens the link could pay
// again. A failed/refunded/cancelled payment does NOT count: those are terminal
// and the customer is allowed to retry.
//
// Manual rows are excluded on purpose. A manual payment (a check recorded on
// the invoicing page) is money already taken by other means, and the customer
// must still be able to pay whatever is LEFT of the invoice online. Counting
// them here would lock the pay link the moment a partial payment is recorded.
// The remaining balance is the real guard on that side: once the invoice is
// fully collected the balance is 0 and the checkout refuses.
//
// Fail-open on a read error (the primary guard is the invoice paid flag, which
// is checked separately and reliably; a transient ledger read failure in this
// narrow window is near-impossible and failing open avoids blocking a
// legitimate customer).
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
    .neq("method", "manual")
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

// Set one invoice's collected amount in quotes.invoice_data (the UI source of
// truth), keeping its status + paidAt in sync through withInvoicePaidCents so
// the two can never drift. Reads the live invoice_data, updates just the
// matching invoice, writes the whole object back. Idempotent.
export async function setInvoicePaymentCents(
  quoteUuid: string,
  kind: InvoiceKind,
  paidCents: number,
  paidAt?: string | null
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("quotes")
    .select("invoice_data")
    .eq("id", quoteUuid)
    .single();
  const row = result.data as QuoteRow | null;
  if (!row || !row.invoice_data) {
    throw new Error(
      `setInvoicePaymentCents: invoice_data not found for ${quoteUuid}`
    );
  }
  const now = new Date().toISOString();
  const nextData = withInvoicePaidCents(
    row.invoice_data,
    kind,
    paidCents,
    paidAt ?? now
  );
  const { error } = await supabase
    .from("quotes")
    .update({ invoice_data: nextData, updated_at: now })
    .eq("id", quoteUuid);
  if (error) {
    throw new Error(`setInvoicePaymentCents update failed: ${error.message}`);
  }
}

// Recompute one invoice's collected amount from the SUCCEEDED rows in the
// payments ledger and write it back. Only succeeded money counts: an ACH still
// in "processing" has not settled and must never read as collected.
//
// This is what the Stripe path uses, and why it is safe there: the ledger holds
// one row per payment intent (the unique index on stripe_payment_intent_id),
// so summing is idempotent no matter how many webhook events arrive or how
// often Stripe redelivers one. Adding a delta instead would double-count a
// redelivered `checkout.session.completed`.
export async function syncInvoicePaidFromLedger(
  quoteUuid: string,
  kind: InvoiceKind
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payments")
    .select("amount_cents, paid_at")
    .eq("quote_id", quoteUuid)
    .eq("invoice_kind", kind)
    .eq("status", "succeeded");
  if (error) {
    throw new Error(`syncInvoicePaidFromLedger read failed: ${error.message}`);
  }
  const rows = (data ?? []) as { amount_cents: number; paid_at: string | null }[];
  const collected = rows.reduce(
    (sum, row) => sum + (Math.round(row.amount_cents) || 0),
    0
  );
  const latestPaidAt =
    rows
      .map((row) => row.paid_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;
  await setInvoicePaymentCents(quoteUuid, kind, collected, latestPaidAt);
  return collected;
}

// Apply a Stripe refund to a ledger row and report which invoice it belongs to.
// `remainingAmountCents` is what is still collected after the refund:
//   - 0 (a full refund) marks the row "refunded", so the recompute drops it.
//   - above 0 (a PARTIAL refund) keeps the row succeeded with the reduced
//     amount, so only the refunded part comes off the invoice. Marking a
//     partially refunded payment "refunded" would drop money the customer still
//     has with us.
// Both are derived from the charge's cumulative amount_refunded, so a repeated
// event is harmless. Returns the row's quote + kind so the caller can resync.
export async function applyStripeRefund(
  stripePaymentIntentId: string,
  remainingAmountCents: number
): Promise<{ quoteUuid: string; kind: InvoiceKind } | null> {
  const supabase = getSupabaseAdmin();
  const remaining = Math.max(0, Math.round(remainingAmountCents) || 0);
  const patch: Record<string, unknown> =
    remaining > 0
      ? { status: "succeeded", amount_cents: remaining }
      : { status: "refunded" };
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