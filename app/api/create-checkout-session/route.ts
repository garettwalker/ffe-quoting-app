import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findInvoice } from "@/lib/invoice-calculations";
import { verifyPayToken } from "@/lib/pay-token";
import type { InvoiceData } from "@/lib/types";

// POST /api/create-checkout-session
// Body: { token }  -- the HMAC-signed pay-link token (lib/pay-token.ts)
//
// Public (the /pay page has no session): the signed token authorizes the
// request; the invoice + amount are ALWAYS re-read from the database via the
// service-role client, never from the token or the browser. Returns a Stripe
// Checkout URL to redirect to once Stripe is wired (step 3). Until then, it
// returns { ok: false, configured: false } so the customer-facing button shows
// an honest "being set up" message instead of a dead end.

export const dynamic = "force-dynamic";

type QuoteRow = {
  quote_id: string;
  invoice_data: InvoiceData | null;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const { token } = (body ?? {}) as { token?: string };
  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  const verified = verifyPayToken(token);
  if (!verified) {
    return NextResponse.json({ ok: false, error: "Invalid or expired link." }, { status: 400 });
  }

  // Re-read the live invoice from the DB. The token only says WHICH invoice; the
  // amount + paid state come from here, so a tampered or stale token can never
  // charge the wrong amount or pay an already-paid invoice.
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("quotes")
    .select("quote_id, invoice_data")
    .eq("id", verified.quoteUuid)
    .single();
  const data = result.data as QuoteRow | null;
  if (result.error || !data || !data.invoice_data) {
    return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
  }
  const invoiceData = data.invoice_data as InvoiceData;
  const invoice = findInvoice(invoiceData, verified.kind);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ ok: false, error: "This invoice is already paid." });
  }
  const amountCents = Math.round(invoice.amountCents) || 0;
  if (amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "No balance is due on this invoice." });
  }

  // Until Stripe is configured (step 3), tell the button to show the "being set
  // up" message. No Stripe keys are required to build/deploy this route.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ ok: false, configured: false });
  }

  // --- Step 3 (Stripe wired): create a Checkout Session with `amountCents` as
  // the line-item amount (card + ACH/us_bank_account), with success/cancel URLs
  // back to /pay/success and /pay/canceled, and return { ok: true, url }. The
  // signed webhook (app/api/stripe-webhook/route.ts) is the source of truth for
  // confirming payment + flipping the invoice flag + writing the ledger row. ---
  return NextResponse.json(
    { ok: false, error: "Online payment is not available yet." },
    { status: 503 }
  );
}