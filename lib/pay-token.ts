import crypto, { timingSafeEqual } from "crypto";
import type { InvoiceKind } from "@/lib/types";

// Server-only, stateless HMAC-signed pay-link tokens.
//
// A pay link identifies ONE invoice on ONE quote: it encodes the quote's uuid
// + the invoice kind, signed with PAY_LINK_SECRET (a random server-only string
// the owner generates). The token is unguessable and carries no DB row id that
// could be enumerated (the payload is opaque base64url; the signature is what
// authorizes it). No DB lookup is needed to validate — the signature is
// self-verifying — but the public /pay page re-reads the invoice from the
// database (via the service-role client) so the amount shown and charged always
// comes from our DB, never from the token or the browser.
//
// The token never expires on its own in v1; rotating PAY_LINK_SECRET
// invalidates every outstanding link at once. Keep PAY_LINK_SECRET out of the
// repo and the browser (server-only; no NEXT_PUBLIC_ prefix).

export function hasPayLinkSecret(): boolean {
  return !!process.env.PAY_LINK_SECRET;
}

export function getAppUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/+$/, "");
}

// Enough to mint a token AND build an absolute URL the customer can open. Used
// to decide whether the admin "copy payment link" affordance should appear.
export function canBuildPayUrl(): boolean {
  return hasPayLinkSecret() && getAppUrl().length > 0;
}

// The full payment chain is live: a pay URL can be minted AND Stripe is wired.
// Used to decide whether invoice emails auto-append a "Pay online" link — we
// only send customers a pay link once clicking it actually lets them pay.
export function paymentsConfigured(): boolean {
  return canBuildPayUrl() && !!process.env.STRIPE_SECRET_KEY;
}

// payload = base64url(JSON { q: quoteUuid, k: kind }); token = payload "." sig.
export function createPayToken(quoteUuid: string, kind: InvoiceKind): string {
  const secret = process.env.PAY_LINK_SECRET;
  if (!secret) throw new Error("Missing PAY_LINK_SECRET environment variable (server-only).");
  const payload = Buffer.from(
    JSON.stringify({ q: quoteUuid, k: kind }),
    "utf8"
  ).toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyPayToken(
  token: string
): { quoteUuid: string; kind: InvoiceKind } | null {
  const secret = process.env.PAY_LINK_SECRET;
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  if (!safeEqual(sig, expected)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      q?: unknown;
      k?: unknown;
    };
    if (typeof obj.q !== "string") return null;
    if (obj.k !== "initial" && obj.k !== "finish" && obj.k !== "service") return null;
    return { quoteUuid: obj.q, kind: obj.k };
  } catch {
    return null;
  }
}

// Absolute customer-facing pay URL, or null when the payment chain isn't fully
// configured (so callers can silently skip the link instead of emitting a dead
// one). Always uses APP_URL (the public site origin), not the current request.
export function buildPayUrl(quoteUuid: string, kind: InvoiceKind): string | null {
  if (!canBuildPayUrl()) return null;
  return `${getAppUrl()}/pay/${createPayToken(quoteUuid, kind)}`;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}