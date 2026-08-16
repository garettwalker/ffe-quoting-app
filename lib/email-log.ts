import { getSupabaseServer } from "@/lib/supabase-server";
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
  const supabase = getSupabaseServer();
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
  const supabase = getSupabaseServer();
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
  const supabase = getSupabaseServer();
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

// When each invoice was first emailed, per quote. `null` means that invoice
// kind has never been emailed (the row may still exist in invoice setup but is
// not yet "receivable"). Used by the receivables / dashboard / lifecycle code
// to decide whether the finish invoice is actually due yet — the finish is
// created at invoice setup but not billed until after the sheetrock gap, so a
// finish that has never been emailed (and isn't paid) is "scheduled", not owed.
// The rough-in (initial) is treated as receivable from setup regardless.
export type InvoiceReceipts = {
  initial: string | null;
  finish: string | null;
};

function emptyReceipts(): InvoiceReceipts {
  return { initial: null, finish: null };
}

// Fold a set of sent-invoice-email rows into the earliest sent_at per kind.
function foldReceipts(rows: { invoice_kind: string | null; sent_at: string }[]): InvoiceReceipts {
  const out = emptyReceipts();
  for (const row of rows) {
    if (row.invoice_kind === "initial" || row.invoice_kind === "finish") {
      const prev = out[row.invoice_kind];
      if (prev === null || row.sent_at < prev) {
        out[row.invoice_kind] = row.sent_at;
      }
    }
  }
  return out;
}

// Batch: for a set of quote ids, the earliest sent invoice email date per
// kind. One query, folded in memory. Empty input returns an empty map; callers
// should treat a missing key as "never emailed" (both kinds null).
export async function loadInvoiceReceipts(
  quoteIds: string[]
): Promise<Map<string, InvoiceReceipts>> {
  const map = new Map<string, InvoiceReceipts>();
  if (quoteIds.length === 0) return map;
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("email_log")
    .select("quote_id, invoice_kind, sent_at")
    .in("quote_id", quoteIds)
    .eq("doc", "invoice")
    .eq("status", "sent");

  if (error || !data) return map;
  for (const row of data as {
    quote_id: string | null;
    invoice_kind: string | null;
    sent_at: string;
  }[]) {
    if (!row.quote_id) continue;
    const existing = map.get(row.quote_id) ?? emptyReceipts();
    const candidate = foldReceipts([
      { invoice_kind: row.invoice_kind, sent_at: row.sent_at }
    ]);
    map.set(row.quote_id, {
      initial:
        candidate.initial &&
        (existing.initial === null || candidate.initial < existing.initial)
          ? candidate.initial
          : existing.initial,
      finish:
        candidate.finish &&
        (existing.finish === null || candidate.finish < existing.finish)
          ? candidate.finish
          : existing.finish
    });
  }
  return map;
}

// From already-loaded email history for a single quote (the saved-quote and
// invoicing pages already fetch this). Filters to sent invoice emails and
// folds to the earliest sent_at per kind.
export function receiptsFromHistory(rows: EmailLogRow[]): InvoiceReceipts {
  const sent = rows.filter(
    (row) => row.doc === "invoice" && row.status === "sent"
  );
  return foldReceipts(
    sent.map((row) => ({ invoice_kind: row.invoice_kind, sent_at: row.sent_at }))
  );
}