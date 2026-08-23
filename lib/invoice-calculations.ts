import type { InvoiceData, InvoiceKind, InvoiceRecord, LifecycleStage, QuoteStatus } from "@/lib/types";
import type { InvoiceReceipts } from "@/lib/email-log";

// All money here is integer cents, matching lib/currency.ts.

// Build the default invoice setup for a freshly accepted quote: contract
// amount equals the quote total, 50/50 split, no permit fee, both invoices
// unpaid and not yet issued.
export function defaultInvoiceData(quoteTotalCents: number): InvoiceData {
  return {
    contractAmountCents: quoteTotalCents,
    roughInPercent: 50,
    finishPercent: 50,
    permitFeeCents: 0,
    generatedAt: new Date().toISOString(),
    invoices: [
      { kind: "initial", amountCents: 0, status: "unpaid", issuedAt: null, paidAt: null },
      { kind: "finish", amountCents: 0, status: "unpaid", issuedAt: null, paidAt: null }
    ]
  };
}

export type InvoiceAmounts = {
  roughInAmountCents: number;
  finishAmountCents: number;
  initialInvoiceAmountCents: number;
  finishInvoiceAmountCents: number;
  totalInvoicedCents: number;
  // True when roughInPercent + finishPercent === 100.
  isBalanced: boolean;
  percentTotal: number;
};

// Derive dollar amounts from the invoice setup. The finish amount is computed
// as contract - roughIn when the split totals 100% so the two always sum
// exactly to the contract (no rounding drift). When the split does not total
// 100%, both amounts are computed from their percentages independently and
// isBalanced is false so the UI can warn the owner.
//
// Once the rough-in (initial) invoice is PAID, its amount is frozen: the money
// was already collected and must not change. Any later edit to the contract
// (line items) or permit fee then flows ENTIRELY to the finish invoice, which
// becomes (contract + permit) - (paid rough-in). The rough-in/finish split is
// bypassed in this state — the finish absorbs the difference — so editing
// line items after rough-in is collected only moves the finish invoice, never
// the paid rough-in.
export function computeInvoiceAmounts(data: InvoiceData): InvoiceAmounts {
  const contract = Math.max(0, Math.round(data.contractAmountCents));
  const roughInPercent = clampPercent(data.roughInPercent);
  const finishPercent = clampPercent(data.finishPercent);
  const permitFeeCents = Math.max(0, Math.round(data.permitFeeCents));
  const percentTotal = roughInPercent + finishPercent;
  const totalCollectible = contract + permitFeeCents;

  const roughInInvoice =
    data.invoices.find((invoice) => invoice.kind === "initial") ?? null;

  if (roughInInvoice?.status === "paid") {
    // Rough-in is locked at the collected amount. The finish invoice gets the
    // remainder of everything still collectible (contract + permit). The
    // rough-in portion shown in the live preview is an informational
    // decomposition of that frozen total minus the current permit fee.
    const initialInvoiceAmountCents = Math.round(roughInInvoice.amountCents) || 0;
    const finishInvoiceAmountCents = Math.max(
      0,
      totalCollectible - initialInvoiceAmountCents
    );
    const roughInAmountCents = Math.max(
      0,
      initialInvoiceAmountCents - permitFeeCents
    );
    return {
      roughInAmountCents,
      finishAmountCents: finishInvoiceAmountCents,
      initialInvoiceAmountCents,
      finishInvoiceAmountCents,
      totalInvoicedCents:
        initialInvoiceAmountCents + finishInvoiceAmountCents,
      // The split is bypassed while rough-in is locked, so treat the setup as
      // balanced so saving is not blocked on the (now-irrelevant) percentages.
      isBalanced: true,
      percentTotal: 100
    };
  }

  const roughInAmountCents = Math.round((contract * roughInPercent) / 100);

  let finishAmountCents: number;
  let isBalanced: boolean;
  if (percentTotal === 100) {
    finishAmountCents = contract - roughInAmountCents;
    isBalanced = true;
  } else {
    finishAmountCents = Math.round((contract * finishPercent) / 100);
    isBalanced = false;
  }

  const initialInvoiceAmountCents = roughInAmountCents + permitFeeCents;
  const finishInvoiceAmountCents = finishAmountCents;
  const totalInvoicedCents = initialInvoiceAmountCents + finishInvoiceAmountCents;

  return {
    roughInAmountCents,
    finishAmountCents,
    initialInvoiceAmountCents,
    finishInvoiceAmountCents,
    totalInvoicedCents,
    isBalanced,
    percentTotal
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// Is this invoice "receivable" (billed and therefore owed / counted on AR)?
//   - paid invoices are always receivable (they were collected).
//   - when `receipts` is omitted, every invoice is receivable (the legacy
//     behavior used by P&L, which reasons about the full contract, not the
//     emailed state).
//   - the initial (rough-in) invoice is receivable from setup — it's the
//     current invoice, billed when invoicing is set up (and often handed over
//     in person / collected as cash, not always emailed).
//   - the finish invoice is receivable only once it has been emailed (a sent
//     email_log row exists) — it is created at setup but not actually billed
//     until after the sheetrock gap, so before the first email it is
//     "scheduled", not owed.
export function invoiceIsReceivable(
  invoice: InvoiceRecord,
  kind: InvoiceKind,
  receipts?: InvoiceReceipts
): boolean {
  if (invoice.status === "paid") return true;
  if (receipts === undefined) return true;
  if (kind === "initial") return true;
  return receipts.finish != null;
}

// The finish invoice's amount when it is still scheduled (not yet emailed and
// not paid). Zero otherwise (it's either receivable or has no amount). Used to
// show "Finish pending: $X" and to keep a job out of "paid in full" while a
// positive-amount finish is still unbilled.
export function scheduledFinishCents(
  data: InvoiceData | null,
  receipts?: InvoiceReceipts
): number {
  if (!data || receipts === undefined) return 0;
  const finish = data.invoices.find((invoice) => invoice.kind === "finish");
  if (!finish || finish.status === "paid") return 0;
  if (receipts.finish != null) return 0;
  return Math.round(finish.amountCents) || 0;
}

// Sum of amounts for invoices that are still unpaid AND receivable (the
// outstanding balance actually owed now). When `receipts` is omitted this
// matches the legacy behavior (all unpaid invoices, including a not-yet-billed
// finish).
export function outstandingCents(
  data: InvoiceData | null,
  receipts?: InvoiceReceipts
): number {
  if (!data) return 0;
  return data.invoices.reduce((sum, invoice) => {
    if (invoice.status !== "unpaid") return sum;
    const kind = invoice.kind;
    if (!invoiceIsReceivable(invoice, kind, receipts)) return sum;
    return sum + (Math.round(invoice.amountCents) || 0);
  }, 0);
}

// Per-invoice outstanding: the invoice amount when still unpaid, 0 once paid.
// Used by the Accounts Receivable view's per-invoice (rough-in / finish) columns.
export function invoiceOutstandingCents(invoice: InvoiceRecord): number {
  return invoice.status === "unpaid"
    ? Math.round(invoice.amountCents) || 0
    : 0;
}

// Sum of amounts for invoices that are receivable (billed). When `receipts` is
// omitted this equals the full contract (both invoices) — the legacy behavior.
// Used for AR's "Total Invoiced" headline + per-job totals, which should only
// count what has actually been billed (a not-yet-emailed finish is excluded).
export function receivableInvoicedCents(
  data: InvoiceData | null,
  receipts?: InvoiceReceipts
): number {
  if (!data) return 0;
  return data.invoices.reduce((sum, invoice) => {
    if (!invoiceIsReceivable(invoice, invoice.kind, receipts)) return sum;
    return sum + (Math.round(invoice.amountCents) || 0);
  }, 0);
}

// True when the job has real invoiced money AND nothing is outstanding. This is
// the single definition of "paid in full" shared by the dashboard lifecycle, the
// invoicing page, the saved-quote page, and Accounts Receivable. It keys on the
// outstanding balance (not the per-invoice paid flags) and requires real invoiced
// money, so a $0-contract quote ($0 outstanding but also $0 invoiced) is NOT paid
// in full and does not count as Pending Payments — matching the AR table, which
// excludes $0 jobs entirely. It also treats a job with a positive paid invoice
// plus a $0 unpaid invoice as paid in full (nothing is owed), again matching AR.
export function isPaidInFull(data: InvoiceData | null, receipts?: InvoiceReceipts): boolean {
  if (!data) return false;
  if (computeInvoiceAmounts(data).totalInvoicedCents <= 0) return false;
  if (receipts === undefined) {
    // Legacy: every invoice counts (used by P&L's full-contract reasoning).
    return outstandingCents(data) === 0;
  }
  // Receivable-aware: nothing owed on billed invoices AND no positive-amount
  // finish still scheduled (a not-yet-billed finish keeps the job in progress,
  // so it is NOT "paid in full" even when the rough-in is collected).
  return (
    outstandingCents(data, receipts) === 0 &&
    scheduledFinishCents(data, receipts) === 0
  );
}

// Find a single invoice record by kind, with a safe fallback.
export function findInvoice(data: InvoiceData, kind: InvoiceKind) {
  return data.invoices.find((invoice) => invoice.kind === kind) ?? null;
}

// The invoice reference shown to the customer, e.g. Q-20260619-001-R.
export function invoiceReference(quoteId: string, kind: InvoiceKind): string {
  return `${quoteId}-${kind === "initial" ? "R" : "F"}`;
}

// The preferred display identifier for an invoice: its dedicated sequential
// number (INV-0001) when one has been assigned, falling back to the derived
// invoiceReference (Q-...-R / -F) for invoices saved before the number field
// existed (lazy backfill). Use this everywhere an invoice is labelled for a
// person to read, so new invoices show INV-NNNN and old ones keep showing the
// reference they were already sent under.
export function invoiceDisplayNumber(
  quoteId: string,
  invoice: { kind: InvoiceKind; invoiceNumber?: string }
): string {
  return invoice.invoiceNumber || invoiceReference(quoteId, invoice.kind);
}

// Map a quote to its dashboard lifecycle stage. Accepted quotes split into
// three sub-stages based on the invoice setup: no invoices set up yet =
// Client Accepted, invoices with money still outstanding = Pending Payments,
// every invoice paid = Paid in Full. draft and prepared pass through
// unchanged. This is derived on the fly from the row status + invoice_data,
// so the dashboard always reflects reality without extra status writes.
export function lifecycleStage(
  status: QuoteStatus,
  invoiceData: InvoiceData | null,
  receipts?: InvoiceReceipts
): LifecycleStage {
  if (status !== "accepted") return status;
  if (!invoiceData) return "accepted";
  // Match the Accounts Receivable partition exactly. Only quotes with real
  // invoiced money (totalInvoicedCents > 0) count as Pending Payments or Paid in
  // Full; a $0-contract quote has nothing owed and nothing collected, so it
  // stays in Client Accepted instead of showing "Pending Payments $0.00". Within
  // real invoices, nothing outstanding = paid in full, something outstanding =
  // pending.
  if (computeInvoiceAmounts(invoiceData).totalInvoicedCents <= 0) return "accepted";
  return isPaidInFull(invoiceData, receipts)
    ? "paid_in_full"
    : "pending_payment";
}