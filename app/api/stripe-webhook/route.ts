import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  applyStripeRefund,
  readInvoiceBalance,
  recordWebhookEvent,
  syncInvoicePaidFromLedger,
  updatePaymentStatus,
  upsertStripePayment,
  type PaymentMethod,
  type PaymentStatus
} from "@/lib/payments";
import type { InvoiceKind } from "@/lib/types";

// POST /api/stripe-webhook
//
// Stripe calls this to confirm a payment. It is public (Stripe has no session)
// and is NOT gated by middleware (it's in PUBLIC_PATHS). Security comes from the
// Stripe-Signature header (verified with STRIPE_WEBHOOK_SECRET). The handler's
// writes are idempotent (payment rows are upserted by Stripe payment intent id;
// the invoice flag flip is idempotent), so a retried/replayed event is safe; we
// also record each processed event id in stripe_webhook_events for observability.
//
// Events handled:
//   checkout.session.completed       -> create the payment row (card = succeeded
//                                        + flip flag; ACH = processing, wait)
//   payment_intent.succeeded           -> mark succeeded + flip flag (ACH settles
//                                        days later, so this is the ACH success)
//   payment_intent.processing          -> mark processing (informational)
//   payment_intent.payment_failed      -> mark failed (invoice stays unpaid)
//   payment_intent.canceled             -> mark failed (owner cancelled an
//                                        incomplete/processing attempt in the
//                                        Stripe dashboard; invoice flag is not
//                                        touched, since a cancel is not a refund
//                                        and the invoice may be paid by another
//                                        successful attempt)
//   charge.refunded                    -> mark refunded + reverse the flag

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) {
    return NextResponse.json(
      { ok: false, error: "Webhook is not configured." },
      { status: 503 }
    );
  }

  const sig = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? "", secret);
  } catch {
    // Bad signature: do NOT return 500 (Stripe would retry a broken signature
    // forever). 400 tells Stripe the event is malformed and to drop it.
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 400 });
  }

  try {
    await handleEvent(stripe, event);
  } catch (err) {
    // A handler failure returns 500 so Stripe retries. Idempotent writes mean a
    // retry is safe.
    console.error("[stripe-webhook] handler error", event.type, event.id, err);
    return NextResponse.json({ ok: false, error: "Handler failed." }, { status: 500 });
  }

  // Record the event after a successful process. Best-effort: a logging failure
  // must not undo the work (the writes above are idempotent, so a retry is safe).
  try {
    await recordWebhookEvent(event.id, event.type);
  } catch (err) {
    console.error("[stripe-webhook] recordWebhookEvent failed", event.id, err);
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const quoteUuid = session.metadata?.quote_uuid;
      const kind = session.metadata?.invoice_kind as InvoiceKind | undefined;
      if (
        !quoteUuid ||
        (kind !== "initial" && kind !== "finish" && kind !== "service")
      ) {
        return;
      }

      const intentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      if (!intentId) return;

      // The amount actually charged. It is the balance the checkout route
      // stamped into the session metadata when it created it (our own value,
      // round-tripped through Stripe), falling back to the live balance for a
      // session created before that stamp existed. Reading it here rather than
      // adding a delta is what makes a redelivered event harmless, and it
      // records the right amount now that a partially paid invoice only charges
      // the remainder.
      const chargedCents =
        parseAmountCents(session.metadata?.amount_cents) ??
        (await readInvoiceBalance(quoteUuid, kind)).balanceCents;

      const method = await resolveMethod(stripe, intentId);
      // Card: session.payment_status === "paid" (immediate). ACH: "processing"
      // (settles days later -> payment_intent.succeeded syncs it then).
      const status: PaymentStatus =
        session.payment_status === "paid" ? "succeeded" : "processing";
      const paidAt = status === "succeeded" ? new Date().toISOString() : null;

      await upsertStripePayment({
        quoteUuid,
        kind,
        amountCents: chargedCents,
        method,
        status,
        stripePaymentIntentId: intentId,
        stripeSessionId: session.id,
        paidAt
      });
      if (status === "succeeded") {
        // Recompute the invoice's collected amount from the ledger. Idempotent:
        // one row per payment intent, so a replayed event sets the same total
        // instead of adding twice.
        await syncInvoicePaidFromLedger(quoteUuid, kind);
      }
      return;
    }

    case "payment_intent.succeeded":
    case "payment_intent.processing":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const status: PaymentStatus =
        event.type === "payment_intent.succeeded"
          ? "succeeded"
          : event.type === "payment_intent.payment_failed" ||
              event.type === "payment_intent.canceled"
            ? "failed"
            : "processing";
      const ctx = await updatePaymentStatus(intent.id, status);
      // Resync after EVERY status change. Only succeeded rows count toward the
      // invoice, so this is a no-op for processing/pending while still being
      // right for the two cases that matter: an ACH settling days later
      // (processing -> succeeded adds the money), and an ACH RETURN after it
      // looked settled (succeeded -> failed takes it back off). A canceled
      // attempt that never settled correctly leaves the invoice as it was.
      if (ctx) {
        await syncInvoicePaidFromLedger(ctx.quoteUuid, ctx.kind);
      }
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
      if (!intentId) return;
      // What is still collected after this refund. amount_refunded is
      // cumulative for the charge, so this is safe to recompute on a repeated
      // event. A partial refund keeps the row succeeded at the reduced amount
      // (marking it refunded would drop money the customer still has with us);
      // a full refund marks it refunded so the recompute takes it off.
      const remaining =
        Math.max(0, Math.round(charge.amount) || 0) -
        Math.max(0, Math.round(charge.amount_refunded) || 0);
      const ctx = await applyStripeRefund(intentId, remaining);
      if (ctx) {
        // Recompute rather than zero: any other payment still standing on that
        // invoice (another card, or a manual payment) stays collected.
        await syncInvoicePaidFromLedger(ctx.quoteUuid, ctx.kind);
      }
      return;
    }

    default:
      // Other event types are ignored for v1.
      return;
  }
}

// Parse the amount the checkout route stamped into the session metadata. Returns
// null when it is missing or unreadable so the caller falls back to the DB.
function parseAmountCents(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

// Determine card vs ACH from the payment method on the intent. Best-effort: any
// failure defaults to "card" (the method column is informational for the ledger;
// the amount + flag logic never depends on it).
async function resolveMethod(
  stripe: Stripe,
  intentId: string
): Promise<PaymentMethod> {
  try {
    const intent = await stripe.paymentIntents.retrieve(intentId, {
      expand: ["payment_method"]
    });
    const pm = intent.payment_method as Stripe.PaymentMethod | null;
    return pm?.type === "us_bank_account" ? "ach_debit" : "card";
  } catch {
    return "card";
  }
}