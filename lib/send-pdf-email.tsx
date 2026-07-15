import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import { DetailedQuotePdfDocument } from "@/components/pdf/detailed-quote-document";
import { InvoicePdfDocument } from "@/components/pdf/invoice-document";
import { SummaryQuotePdfDocument } from "@/components/pdf/summary-quote-document";
import { loadDetailedQuotePdfInput } from "@/lib/detailed-quote-pdf";
import { loadInvoicePdfInput } from "@/lib/invoice-pdf";
import { loadSummaryQuotePdfInput } from "@/lib/summary-quote-pdf";

// Server-only email helper. The printable PDFs already render server-side to a
// buffer (the four /pdf routes use renderToBuffer); this reuses the exact same
// load*PdfInput helpers + renderToBuffer so an emailed PDF is byte-identical to
// the downloaded one (and the on-screen preview). No new PDF rendering here.

export type EmailDocKind = "detailed" | "summary" | "invoice";
export type InvoiceKind = "initial" | "finish";

export type EmailAttachment = {
  buffer: Buffer;
  fileName: string;
  clientEmail: string;
  clientName: string;
  quoteId: string;
  reference: string; // quote_id for quotes, invoice reference for invoices
  docTitle: string; // "Detailed Quote" / "Summary Quote" / "Initial Invoice" / "Finish Invoice"
};

// Renders the requested document to a PDF buffer by dispatching to the existing
// per-doc helpers. Returns null when the quote / invoice setup can't be loaded
// (caller surfaces not-found), matching the PDF routes' own behavior.
export async function renderEmailAttachment(
  id: string,
  doc: EmailDocKind,
  invoiceKind?: InvoiceKind
): Promise<EmailAttachment | null> {
  if (doc === "detailed") {
    const input = await loadDetailedQuotePdfInput(id);
    if (!input) return null;
    const buffer = await renderToBuffer(
      <DetailedQuotePdfDocument {...input.pdfProps} />
    );
    return {
      buffer,
      fileName: input.fileName,
      clientEmail: input.quote.clientEmail ?? "",
      clientName: input.quote.clientName ?? "",
      quoteId: input.quote.quoteId ?? "",
      reference: input.quote.quoteId ?? "",
      docTitle: "Detailed Quote"
    };
  }

  if (doc === "summary") {
    const input = await loadSummaryQuotePdfInput(id);
    if (!input) return null;
    const buffer = await renderToBuffer(
      <SummaryQuotePdfDocument {...input.pdfProps} />
    );
    return {
      buffer,
      fileName: input.fileName,
      clientEmail: input.quote.clientEmail ?? "",
      clientName: input.quote.clientName ?? "",
      quoteId: input.quote.quoteId ?? "",
      reference: input.quote.quoteId ?? "",
      docTitle: "Summary Quote"
    };
  }

  // invoice
  if (!invoiceKind) return null;
  const input = await loadInvoicePdfInput(id, invoiceKind);
  if (!input) return null;
  const buffer = await renderToBuffer(
    <InvoicePdfDocument {...input.pdfProps} />
  );
  // The invoice helper does not return the raw quote/client fields, so pull them
  // back out of the pre-formatted props (clientEmail/clientName live there).
  return {
    buffer,
    fileName: input.fileName,
    clientEmail: input.pdfProps.clientEmail ?? "",
    clientName: input.pdfProps.clientName ?? "",
    quoteId: input.pdfProps.reference ?? "",
    reference: input.pdfProps.reference ?? "",
    docTitle: input.pdfProps.title
  };
}

export type EmailDefaultsInput = {
  doc: EmailDocKind;
  quoteId?: string;
  reference?: string;
  businessName: string;
};

// Default subject + body per document type. No em dashes (house style).
export function buildEmailDefaults({
  doc,
  quoteId,
  reference,
  businessName
}: EmailDefaultsInput): { subject: string; message: string } {
  const name = businessName || "Freedom Family Electric";

  if (doc === "invoice") {
    const ref = reference || "";
    return {
      subject: `Invoice ${ref} from ${name}`,
      message: `Hi,\n\nPlease find your invoice attached. Payment details are on the invoice. Let me know if you have any questions.\n\nThank you,\n${name}`
    };
  }

  if (doc === "summary") {
    const ref = quoteId || "";
    return {
      subject: `Your summary quote from ${name}${ref ? ` (${ref})` : ""}`,
      message: `Hi,\n\nPlease find the summary of your quote attached. It shows one subtotal per scope category plus the total. A detailed line-item version is available on request.\n\nLet me know if you have any questions.\n\nThank you,\n${name}`
    };
  }

  // detailed
  const ref = quoteId || "";
  return {
    subject: `Your detailed quote from ${name}${ref ? ` (${ref})` : ""}`,
    message: `Hi,\n\nPlease find your detailed quote attached. Review the line items and let me know if you have any questions or want to adjust anything.\n\nThank you,\n${name}`
  };
}

export type SendPdfEmailInput = {
  from: string;
  to: string;
  subject: string;
  message: string;
  attachment: EmailAttachment;
};

export type SendPdfEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Resolves the "from" address for a document. Quotes (detailed + summary) send
// from EMAIL_FROM. Invoices (initial + finish) send from EMAIL_FROM_INVOICES
// when it is set, otherwise fall back to EMAIL_FROM. Both must live on a domain
// the owner has verified in Resend. Returns "" when nothing is configured.
export function getEmailFrom(doc: EmailDocKind): string {
  if (doc === "invoice") {
    const invoiceFrom = process.env.EMAIL_FROM_INVOICES;
    if (invoiceFrom) return invoiceFrom;
  }
  return process.env.EMAIL_FROM ?? "";
}

// Sends the PDF as an attachment via Resend. The caller resolves the "from"
// address (see getEmailFrom). Returns a plain ok/error result so the API route
// can map it to an HTTP status without leaking provider internals.
export async function sendPdfEmail({
  from,
  to,
  subject,
  message,
  attachment
}: SendPdfEmailInput): Promise<SendPdfEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Email is not configured. Set RESEND_API_KEY in the environment."
    };
  }
  if (!from) {
    return {
      ok: false,
      error:
        "Email is not configured. Set EMAIL_FROM (and optionally EMAIL_FROM_INVOICES) in the environment."
    };
  }

  // Simple HTML: keep the plain-text body readable while escaping the few
  // characters that matter. Newlines become <br>.
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2a1d;white-space:pre-wrap;">${escapeHtml(
    message
  )}</div>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments: [
        {
          filename: attachment.fileName,
          content: attachment.buffer
        }
      ]
    });

    if (error) {
      return { ok: false, error: error.message ?? "Resend rejected the email." };
    }
    if (!data?.id) {
      return { ok: false, error: "Resend did not return a message id." };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email."
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Lightweight email shape check; not a full RFC validator, but rejects the
// obvious mistakes (empty, no "@", spaces). Resend itself validates fully.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}