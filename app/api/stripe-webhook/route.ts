import { NextResponse } from "next/server";

// POST /api/stripe-webhook
//
// Stripe calls this to confirm a payment. It is public (Stripe has no session)
// and is NOT gated by middleware (it's in PUBLIC_PATHS). Security comes from the
// Stripe signature header (verified with STRIPE_WEBHOOK_SECRET) and idempotent
// handling (a stripe_webhook_events log keyed by event id) so a replayed or
// retried event is applied exactly once.
//
// This is the skeleton: until STRIPE_WEBHOOK_SECRET is set (step 3) it returns
// 503 so Stripe (or a stray request) gets a clear "not configured" and nothing
// runs. Step 3 fills in: signature verification, checkout.session.completed
// handling (insert a `payments` row + flip the invoice flag), and ACH
// delayed-settlement / return handling.

export const dynamic = "force-dynamic";

export async function POST() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Webhook is not configured." },
      { status: 503 }
    );
  }

  // --- Step 3: verify the Stripe-Signature header against `secret`, parse the
  // event, idempotency-check against stripe_webhook_events, then on
  // checkout.session.completed insert a payments row (method card/ach_debit)
  // and flip the matching invoice's flag in quotes.invoice_data. ---

  return NextResponse.json({ ok: false, error: "Webhook is not configured." }, { status: 503 });
}