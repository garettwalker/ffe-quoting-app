import { supabase } from "@/lib/supabase";
import type { EmailDocKind, InvoiceKind } from "@/lib/send-pdf-email";

// Append-only email audit log. Every send through /api/email-pdf writes one
// row here (both successful and failed), so the owner can see — per quote and
// across all quotes — what was emailed, to whom, when, and whether it worked.
// The log is append-only: no update/delete functions or RLS policies.

export type EmailLogRow = {
  id: string;
  quote_id: string | null;
  doc: EmailDocKind;
  invoice_kind: InvoiceKind | null;
  reference: string;
  doc_title: string;
  recipient: string;
  subject: string;
  provider_message_id: string | null;
  status: "sent" | "failed";
  error: string;
  sent_at: string;
};

export type LogEmailSendPayload = {
  quoteId: string;
  doc: EmailDocKind;
  invoiceKind?: InvoiceKind;
  reference: string;
  docTitle: string;
  recipient: string;
  subject: string;
  providerMessageId: string | null;
  status: "sent" | "failed";
  error: string;
};

// Best-effort insert. Never throws: a logging failure must not change the send
// response or break a successful send. Errors are logged server-side only.
export async function logEmailSend(
  payload: LogEmailSendPayload
): Promise<void> {
  try {
    await supabase.from("email_log").insert({
      quote_id: payload.quoteId,
      doc: payload.doc,
      invoice_kind: payload.invoiceKind ?? null,
      reference: payload.reference,
      doc_title: payload.docTitle,
      recipient: payload.recipient,
      subject: payload.subject,
      provider_message_id: payload.providerMessageId,
      status: payload.status,
      error: payload.error
    });
  } catch (err) {
    console.error("email_log insert failed:", err);
  }
}

// All sends for one quote, newest first. Used by the saved-quote page.
export async function getEmailHistoryForQuote(
  quoteId: string
): Promise<EmailLogRow[]> {
  const { data, error } = await supabase
    .from("email_log")
    .select(
      "id, quote_id, doc, invoice_kind, reference, doc_title, recipient, subject, provider_message_id, status, error, sent_at"
    )
    .eq("quote_id", quoteId)
    .order("sent_at", { ascending: false });

  if (error || !data) return [];
  return data as EmailLogRow[];
}

// Most recent sends across all quotes, newest first. Used by /email-log.
export async function getRecentEmailLog(
  limit = 50
): Promise<EmailLogRow[]> {
  const { data, error } = await supabase
    .from("email_log")
    .select(
      "id, quote_id, doc, invoice_kind, reference, doc_title, recipient, subject, provider_message_id, status, error, sent_at"
    )
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as EmailLogRow[];
}