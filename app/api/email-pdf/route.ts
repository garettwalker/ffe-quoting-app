import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import { logEmailSend } from "@/lib/email-log";
import { getSettings } from "@/lib/pricing";
import {
  buildEmailDefaults,
  getEmailFrom,
  isValidEmail,
  renderEmailAttachment,
  sendPdfEmail,
  type EmailDocKind,
  type InvoiceKind
} from "@/lib/send-pdf-email";

// POST /api/email-pdf
// Body: { id, doc, invoiceKind?, to, subject?, message? }
// Renders the requested quote/invoice PDF to a buffer (same path the Download
// PDF routes use) and sends it to `to` as an attachment via Resend.
//
// SECURITY: gated to an admin session (Phase B). getServerUser() reads the
// Supabase session from cookies; only an authenticated admin may send. An
// unauthenticated caller gets 401, a non-admin gets 403. Pair with the
// middleware front-door redirect that already keeps anonymous users off the
// pages that expose this button.

export const dynamic = "force-dynamic";

const DOCS: EmailDocKind[] = ["detailed", "summary", "invoice"];
const INVOICE_KINDS: InvoiceKind[] = ["initial", "finish"];

export async function POST(request: Request) {
  // Auth gate (Phase B): only an admin may send emails as the business.
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in required." },
      { status: 401 }
    );
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin access required." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const { id, doc, invoiceKind, to, subject, message } =
    (body ?? {}) as {
      id?: string;
      doc?: string;
      invoiceKind?: string;
      to?: string;
      subject?: string;
      message?: string;
    };

  if (!id || typeof id !== "string") {
    return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });
  }
  if (!doc || !DOCS.includes(doc as EmailDocKind)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid doc." },
      { status: 400 }
    );
  }
  if (doc === "invoice") {
    if (!invoiceKind || !INVOICE_KINDS.includes(invoiceKind as InvoiceKind)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid invoiceKind." },
        { status: 400 }
      );
    }
  }
  if (!to || !isValidEmail(to)) {
    return NextResponse.json(
      { ok: false, error: "A valid recipient email is required." },
      { status: 400 }
    );
  }

  // Render the PDF attachment and load the live business settings (for the
  // reply-to address and the defaults-fallback business name) in parallel.
  const [attachment, settings] = await Promise.all([
    renderEmailAttachment(
      id,
      doc as EmailDocKind,
      doc === "invoice" ? (invoiceKind as InvoiceKind) : undefined
    ),
    getSettings()
  ]);
  if (!attachment) {
    return NextResponse.json(
      { ok: false, error: "Quote or invoice not found." },
      { status: 404 }
    );
  }

  // Fall back to defaults for any empty field. The client always sends its
  // own pre-filled subject/message (built from the live business name), so
  // this fallback only runs if the endpoint is called directly with blanks.
  const defaults = buildEmailDefaults({
    doc: doc as EmailDocKind,
    quoteId: attachment.quoteId,
    reference: attachment.reference,
    businessName: settings.businessName || "Freedom Family Electric",
    quoteUuid: id,
    invoiceKind: doc === "invoice" ? (invoiceKind as InvoiceKind) : undefined
  });

  const finalSubject = subject?.trim() ? subject.trim() : defaults.subject;
  const finalMessage = message && message.trim() ? message : defaults.message;

  // Quotes send from EMAIL_FROM; invoices from EMAIL_FROM_INVOICES (falls back
  // to EMAIL_FROM when not set).
  const from = getEmailFrom(doc as EmailDocKind);

  // Replies go to the business email on file (e.g. freedomfamilyelectric@gmail.com),
  // not the sending address, so the owner actually receives customer replies.
  const replyTo = settings.businessEmail || undefined;

  const result = await sendPdfEmail({
    from,
    replyTo,
    to: to.trim(),
    subject: finalSubject,
    message: finalMessage,
    attachment
  });

  // Append an audit-log row (both sent and failed). Best-effort: a logging
  // failure never changes the send response or breaks a successful send.
  await logEmailSend({
    quoteId: id,
    doc: doc as EmailDocKind,
    invoiceKind: doc === "invoice" ? (invoiceKind as InvoiceKind) : undefined,
    reference: attachment.reference,
    docTitle: attachment.docTitle,
    recipient: to.trim(),
    subject: finalSubject,
    providerMessageId: result.ok ? result.id : null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? "" : result.error
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: result.id });
}