import { NextResponse } from "next/server";
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
// SECURITY: this endpoint is currently OPEN (no auth). Until owner/admin login
// (Supabase Auth) lands, anyone with the URL can trigger a send as the business.
// That tightening is the documented next step after this feature is verified.
// See the README "Sending email from the app" section.

export const dynamic = "force-dynamic";

const DOCS: EmailDocKind[] = ["detailed", "summary", "invoice"];
const INVOICE_KINDS: InvoiceKind[] = ["initial", "finish"];

export async function POST(request: Request) {
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
    businessName: settings.businessName || "Freedom Family Electric"
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

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: result.id });
}