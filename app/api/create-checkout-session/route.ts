import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hasActivePayment, achAvailableForAmount } from "@/lib/payments";
import { findInvoice, invoiceDisplayNumber } from "@/lib/invoice-calculations";
import { verifyPayToken, getAppUrl } from "@/lib/pay-token";
import type { InvoiceData, InvoiceKind, QuoteFormState } from "@/lib/types";

// POST /api/create-checkout-session
// Body: { token }  -- the HMAC-signed pay-link token (lib/pay-token.ts)
//
// Public (the /pay page has no session): the signed token authorizes the
// request; the invoice + amount are ALWAYS re-read from the database via the
// service-role client, never from the token or the browser. Creates a Stripe
// Checkout Session (card + US bank account / ACH) and returns its URL. The
// session carries metadata (quote_uuid + invoice_kind) so the webhook can find
// the invoice when Stripe confirms payment. Until STRIPE_SECRET_KEY is set,
// returns { ok: false, configured: false } so the customer-facing button shows an
// honest "being set up" message.

export const dynamic = "force-dynamic";

type QuoteRow = {
  quote_id: string;
  quote_data: QuoteFormState;
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
    .select("quote_id, quote_data, invoice_data")
    .eq("id", verified.quoteUuid)
    .single();
  const data = result.data as QuoteRow | null;
  if (result.error || !data || !data.invoice_data) {
    return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
  }
  const invoiceData = data.invoice_data;
  const invoice = findInvoice(invoiceData, verified.kind);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ ok: false, error: "This invoice is already paid." });
  }

  // Double-payment guard: refuse to start a new charge if there is already an
  // active Stripe payment for this invoice (processing/pending/succeeded). In
  // live mode an ACH can sit "processing" for 1-3 business days while the invoice
  // flag is still unpaid (it only flips on payment_intent.succeeded), so without
  // this a customer who reopens the link could be charged twice. A
  // failed/refunded/cancelled payment does not block; those are retries.
  if (await hasActivePayment(verified.quoteUuid, verified.kind)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A payment for this invoice is already in progress. Please wait for it to finish, or contact us if you need help."
      },
      { status: 409 }
    );
  }

  const amountCents = Math.round(invoice.amountCents) || 0;
  if (amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "No balance is due on this invoice." });
  }

  // Until Stripe is configured, tell the button to show the "being set up"
  // message (step 2 behavior).
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ ok: false, configured: false });
  }

  const appUrl = getAppUrl();
  if (!appUrl) {
    return NextResponse.json(
      { ok: false, error: "APP_URL is not configured." },
      { status: 500 }
    );
  }

  // The customer-facing invoice identifier on the Stripe line item: the
  // sequential INV-NNNN number when present, else the Q-...-R / -F reference
  // for invoices saved before the number field existed.
  const reference = invoiceDisplayNumber(data.quote_id, invoice);
  const clientEmail = data.quote_data?.clientEmail || undefined;

  // Offer ACH (US bank account) only when the invoice is at or under the account's
  // ACH per-payment cap (lib/payments.ts ACH_LIMIT_CENTS). Over the cap Stripe
  // would reject the ACH charge mid-Checkout, so we don't offer the bank option
  // at all — the customer sees card only, and the /pay page notes why. Under the
  // cap, both card and ACH show as normal.
  const offerAch = achAvailableForAmount(amountCents);

  const stripe = new Stripe(stripeKey);
  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      // Card always; ACH only when the amount is within the ACH cap.
      payment_method_types: offerAch ? ["card", "us_bank_account"] : ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: { name: `Invoice ${reference}` }
          }
        }
      ],
      success_url: `${appUrl}/pay/success`,
      cancel_url: `${appUrl}/pay/canceled`,
      // The webhook uses these to find the invoice when Stripe confirms payment.
      metadata: {
        quote_uuid: verified.quoteUuid,
        invoice_kind: verified.kind
      },
      ...(clientEmail ? { customer_email: clientEmail } : {})
    };

    if (offerAch) {
      // Force instant ACH verification via Stripe Financial Connections (Plaid)
      // so the customer logs into their bank once and the charge settles
      // normally. Setting verification_method to "instant" REMOVES the "enter
      // bank manually" option from Checkout — that manual path falls back to
      // microdeposit verification, which can't complete inside a one-shot
      // Checkout and leaves the payment "incomplete" indefinitely (the owner
      // hit exactly this by choosing manual entry during testing).
      sessionParams.payment_method_options = {
        us_bank_account: {
          verification_method: "instant",
          financial_connections: {
            permissions: ["payment_method"]
          }
        }
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { ok: false, error: "Stripe did not return a checkout URL." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create checkout session.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}