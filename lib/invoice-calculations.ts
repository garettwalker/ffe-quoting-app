import type {
  InvoiceData,
  InvoiceKind,
  InvoiceRecord,
  InvoiceStatus,
  LifecycleStage,
  QuoteStatus,
  QuoteType,
  ServiceLifecycleStage
} from "@/lib/types";
import type { InvoiceReceipts } from "@/lib/email-log";

// All money here is integer cents, matching lib/currency.ts.

// A service-call invoice setup comes in two shapes, detected by which invoice
// kinds are present (not by quoteType alone, since a split service call reuses
// the new-build initial/finish kinds):
//   - UNSPLIT: a single kind "service" invoice (due on completion). The
//     original service-call model, preserved for quick jobs (troubleshoot, a
//     small repair) and for every service quote saved before the split option
//     existed. Direct invoices (created without a quote first) ALWAYS have this
//     single-service shape, so they count here too.
//   - SPLIT: kind "initial" (deposit) + kind "finish" (final), reusing the
//     new-build two-invoice machinery (a % split of the contract, no permit,
//     paid-deposit freeze). Lets Chad bill 50% up front / 50% at finish on a
//     remodel sized like a service call.
export function isUnsplitServiceCall(data: InvoiceData | null): boolean {
  return (
    (data?.quoteType === "service_call" ||
      data?.quoteType === "direct_invoice") &&
    Array.isArray(data.invoices) &&
    data.invoices.some((invoice) => invoice.kind === "service")
  );
}

// Build the default invoice setup for a freshly accepted quote.
// New build: contract = quote total, 50/50 split, no permit fee, two invoices
// (initial + finish) unpaid and not yet issued.
// Service call: contract = quote total, ONE invoice (kind "service") unpaid,
// no split, no permit. The service-invoice-builder fills in the freeform lines
// and the invoice amount; this just lays down the empty shell. (A split service
// call is NOT built here — the owner toggles it in the builder, which then
// writes initial + finish records instead of this single service shell.)
export function defaultInvoiceData(
  quoteTotalCents: number,
  quoteType: QuoteType = "new_build"
): InvoiceData {
  if (quoteType === "service_call") {
    return {
      quoteType: "service_call",
      contractAmountCents: quoteTotalCents,
      roughInPercent: 0,
      finishPercent: 0,
      permitFeeCents: 0,
      generatedAt: new Date().toISOString(),
      invoices: [
        { kind: "service", amountCents: 0, status: "unpaid", issuedAt: null, paidAt: null }
      ]
    };
  }
  return {
    quoteType: "new_build",
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
// Once ANY money has been collected against the rough-in (initial) invoice, its
// amount is frozen: the money was already taken and must not be rewritten. This
// covers a fully paid rough-in and a partially paid one (a customer paying part
// of a stalled job, say). Any later edit to the contract (line items) or permit
// fee then flows ENTIRELY to the finish invoice, which becomes
// (contract + permit) - (rough-in amount). The rough-in/finish split is
// bypassed in this state — the finish absorbs the difference — so editing
// line items after rough-in money is collected only moves the finish invoice,
// never the rough-in.
export function computeInvoiceAmounts(data: InvoiceData): InvoiceAmounts {
  const contract = Math.max(0, Math.round(data.contractAmountCents));

  // UNSPLIT service call: a single kind "service" invoice, no split, no
  // permit, no paid-deposit freeze. Early-return BEFORE the new-build freeze
  // path so that logic never runs on an unsplit service record. The whole
  // contract is invoiced on the one "service" record.
  // (A SPLIT service call — kind "initial" + "finish" — intentionally does NOT
  // early-return here; it falls through to the existing two-invoice split path
  // below, with permit 0 and the paid-deposit freeze, reusing the new-build
  // machinery for deposit/final billing.)
  if (isUnsplitServiceCall(data)) {
    return {
      roughInAmountCents: 0,
      finishAmountCents: 0,
      initialInvoiceAmountCents: contract,
      finishInvoiceAmountCents: 0,
      totalInvoicedCents: contract,
      isBalanced: true,
      percentTotal: 100
    };
  }

  const roughInPercent = clampPercent(data.roughInPercent);
  const finishPercent = clampPercent(data.finishPercent);
  const permitFeeCents = Math.max(0, Math.round(data.permitFeeCents));
  const percentTotal = roughInPercent + finishPercent;
  const totalCollectible = contract + permitFeeCents;

  // The stored contract is the sum of ALL lines (including targeted
  // adjustments). Pull the rough-in/finish-only ones back out so the % split
  // applies to the base contract, then re-apply them to their invoice below.
  const { roughInAdjustmentCents, finishAdjustmentCents } = sumAdjustments(
    data.scopeLines
  );
  const baseContract = contract - roughInAdjustmentCents - finishAdjustmentCents;

  const roughInInvoice =
    data.invoices.find((invoice) => invoice.kind === "initial") ?? null;

  // Money collected against the rough-in pins its bill. (The trigger is any
  // payment on THAT invoice, not a payment anywhere on the job, so collecting
  // a finish payment never freezes the rough-in.)
  if (roughInInvoice && invoicePaidCents(roughInInvoice) > 0) {
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

  const roughInBaseCents = Math.round((baseContract * roughInPercent) / 100);
  const roughInAmountCents = roughInBaseCents + roughInAdjustmentCents;

  let finishAmountCents: number;
  let isBalanced: boolean;
  if (percentTotal === 100) {
    finishAmountCents = baseContract - roughInBaseCents + finishAdjustmentCents;
    isBalanced = true;
  } else {
    finishAmountCents =
      Math.round((baseContract * finishPercent) / 100) + finishAdjustmentCents;
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

// Sum the pricing-adjustment lines by target. "both" (or a missing target)
// adjustments stay folded into the contract and are split by the percentages;
// "rough_in" and "finish" adjustments are pulled out of the contract and applied
// directly to their invoice so they move only that invoice.
function sumAdjustments(scopeLines: InvoiceData["scopeLines"]): {
  roughInAdjustmentCents: number;
  finishAdjustmentCents: number;
} {
  let roughInAdjustmentCents = 0;
  let finishAdjustmentCents = 0;
  if (!Array.isArray(scopeLines)) {
    return { roughInAdjustmentCents, finishAdjustmentCents };
  }
  for (const line of scopeLines) {
    if (!line.isAdjustment) continue;
    const cents = Math.round(line.quantity * line.unitPriceCents);
    if (line.adjustmentTarget === "rough_in") roughInAdjustmentCents += cents;
    else if (line.adjustmentTarget === "finish") finishAdjustmentCents += cents;
  }
  return { roughInAdjustmentCents, finishAdjustmentCents };
}

// ---------------------------------------------------------------------------
// Collected money (partial payments)
//
// `paidCents` on an invoice record is the amount actually collected against it.
// It is optional so invoice_data saved before partial payments keeps loading,
// and every helper here falls back to the legacy binary flag when it is absent,
// which is why no backfill is needed: a pre-existing paid invoice still reads
// as fully collected and a pre-existing unpaid one still reads as nothing in.
// The `payments` ledger rows remain the audit trail of individual payments.
// ---------------------------------------------------------------------------

// Money collected against one invoice.
export function invoicePaidCents(invoice: InvoiceRecord): number {
  if (
    typeof invoice.paidCents === "number" &&
    Number.isFinite(invoice.paidCents)
  ) {
    return Math.max(0, Math.round(invoice.paidCents));
  }
  // Legacy: no recorded amount, so the flag decides.
  return invoice.status === "paid" ? Math.max(0, Math.round(invoice.amountCents) || 0) : 0;
}

// True when the whole invoice has been collected. Keyed on the amount, not on
// the stored flag, so it can never disagree with the money: a $0 invoice is
// never "fully paid" by arithmetic (0 >= 0 would otherwise say it was).
export function invoiceFullyPaid(invoice: InvoiceRecord): boolean {
  if (invoice.status === "paid") return true;
  const amount = Math.max(0, Math.round(invoice.amountCents) || 0);
  return amount > 0 && invoicePaidCents(invoice) >= amount;
}

// What is still owed on one invoice: its amount less everything collected.
export function invoiceBalanceCents(invoice: InvoiceRecord): number {
  const amount = Math.max(0, Math.round(invoice.amountCents) || 0);
  return Math.max(0, amount - invoicePaidCents(invoice));
}

// Money is in, but the invoice is not settled yet.
export function invoiceIsPartial(invoice: InvoiceRecord): boolean {
  return invoicePaidCents(invoice) > 0 && !invoiceFullyPaid(invoice);
}

// More was collected than the invoice is for. Only reachable after an invoice
// is edited down below what was already collected (allowed on purpose, flagged
// in the UI, since the app has no credit or refund model to resolve it).
export function invoiceIsOverpaid(invoice: InvoiceRecord): boolean {
  const amount = Math.max(0, Math.round(invoice.amountCents) || 0);
  return invoicePaidCents(invoice) > amount;
}

// Total collected across a job's invoices.
export function quoteCollectedCents(data: InvoiceData | null): number {
  if (!data) return 0;
  return data.invoices.reduce((sum, invoice) => sum + invoicePaidCents(invoice), 0);
}

// Derive an invoice's stored flag from the money collected against it. The one
// place that decides paid vs unpaid, so the flag can never disagree with
// `paidCents`. A $0 invoice is never "paid" by arithmetic (0 >= 0 would
// otherwise say it was); an amount below what was collected stays "paid" and
// reads as overpaid in the UI.
export function invoiceStatusFor(
  collectedCents: number,
  amountCents: number
): InvoiceStatus {
  const amount = Math.max(0, Math.round(amountCents) || 0);
  const collected = Math.max(0, Math.round(collectedCents) || 0);
  return (amount > 0 && collected >= amount ? "paid" : "unpaid") as InvoiceStatus;
}

// Return a copy of invoice_data with one invoice's collected amount replaced,
// keeping its `status` and `paidAt` in sync. This is the single place that
// derives the flag from the money, so the two can never drift apart: callers
// (the manual payment panel, the Stripe helpers) only decide the amount.
export function withInvoicePaidCents(
  data: InvoiceData,
  kind: InvoiceKind,
  paidCents: number,
  paidAt?: string | null
): InvoiceData {
  const invoices = data.invoices.map((invoice) => {
    if (invoice.kind !== kind) return invoice;
    const collected = Math.max(0, Math.round(paidCents) || 0);
    // Keep the date of the most recent payment for a partial, and the settling
    // date for a full payment; clear it when nothing is collected.
    const nextPaidAt =
      collected > 0 ? paidAt ?? invoice.paidAt ?? new Date().toISOString() : null;
    return {
      ...invoice,
      paidCents: collected,
      status: invoiceStatusFor(collected, invoice.amountCents),
      paidAt: nextPaidAt
    };
  });
  return { ...data, invoices };
}

// Is this invoice "receivable" (billed and therefore owed / counted on AR)?
//   - paid invoices are always receivable (they were collected).
//   - an invoice with money collected is receivable too, even a finish/service
//     invoice that was never emailed: collecting against it IS the billing act
//     (handed over in person, paid as cash), so its remaining balance counts.
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
//   - the service invoice (service-call quote) follows the finish rule: it is
//     receivable only once emailed or paid. "Due on completion" — setting it up
//     is not the billing action; emailing it (or collecting payment) is.
export function invoiceIsReceivable(
  invoice: InvoiceRecord,
  kind: InvoiceKind,
  receipts?: InvoiceReceipts
): boolean {
  if (invoice.status === "paid") return true;
  if (invoicePaidCents(invoice) > 0) return true;
  if (receipts === undefined) return true;
  if (kind === "initial") return true;
  if (kind === "service") return receipts.service != null;
  return receipts.finish != null;
}

// The amount of any invoice that is set up but not yet receivable (not emailed
// and not paid) — i.e. "scheduled / not yet billed". For a new build that's the
// finish invoice; for a service call that's the single service invoice. Zero
// when `receipts` is omitted (legacy full-contract reasoning, used by P&L).
// Used to show "Scheduled / not yet billed: $X" and to keep a job out of "paid
// in full" while a positive-amount invoice is still unbilled. This is the
// generalization of the old finish-only scheduledFinishCents. The amount is the
// invoice's BALANCE, so a partially collected invoice only contributes what is
// still unbilled and the identity
//   receivable invoiced = outstanding + scheduled + collected
// holds on every job.
export function scheduledCents(
  data: InvoiceData | null,
  receipts?: InvoiceReceipts
): number {
  if (!data || receipts === undefined) return 0;
  return data.invoices.reduce((sum, invoice) => {
    if (invoiceIsReceivable(invoice, invoice.kind, receipts)) return sum;
    return sum + invoiceBalanceCents(invoice);
  }, 0);
}

// Backward-compat alias: the finish invoice's scheduled amount specifically.
// Kept so any external caller still importing it keeps working; new code
// should call scheduledCents (which covers both finish and service).
export function scheduledFinishCents(
  data: InvoiceData | null,
  receipts?: InvoiceReceipts
): number {
  if (!data || receipts === undefined) return 0;
  const finish = data.invoices.find((invoice) => invoice.kind === "finish");
  if (!finish) return 0;
  if (invoiceIsReceivable(finish, "finish", receipts)) return 0;
  return invoiceBalanceCents(finish);
}

// Sum of what is still owed on invoices that are receivable (the outstanding
// balance actually owed now). Each invoice contributes its BALANCE, so money
// already collected is never reported as still owed. When `receipts` is omitted
// this matches the legacy behavior (all invoices, including a not-yet-billed
// finish). Billed totals (see receivableInvoicedCents) stay gross on purpose:
// "invoiced" is what was billed, "outstanding" is what is left of it, and the
// difference is what has actually been collected.
export function outstandingCents(
  data: InvoiceData | null,
  receipts?: InvoiceReceipts
): number {
  if (!data) return 0;
  return data.invoices.reduce((sum, invoice) => {
    const kind = invoice.kind;
    if (!invoiceIsReceivable(invoice, kind, receipts)) return sum;
    return sum + invoiceBalanceCents(invoice);
  }, 0);
}

// Per-invoice outstanding: the invoice amount less everything collected on it.
// Used by the Accounts Receivable view's per-invoice (rough-in / finish) columns.
export function invoiceOutstandingCents(invoice: InvoiceRecord): number {
  return invoiceBalanceCents(invoice);
}

// Sum of amounts for invoices that are receivable (billed). Deliberately GROSS
// (never reduced by payments): this is "Total Invoiced", the amount billed, and
// AR derives what was collected as invoiced - outstanding. When `receipts` is
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
  // invoice still scheduled (a not-yet-billed finish — or a not-yet-billed
  // service invoice — keeps the job in progress, so it is NOT "paid in full"
  // even when other invoices are collected).
  return (
    outstandingCents(data, receipts) === 0 &&
    scheduledCents(data, receipts) === 0
  );
}

// Find a single invoice record by kind, with a safe fallback.
export function findInvoice(data: InvoiceData, kind: InvoiceKind) {
  return data.invoices.find((invoice) => invoice.kind === kind) ?? null;
}

// The invoice reference shown to the customer, e.g. Q-20260619-001-R.
// Service invoices use an -S suffix.
export function invoiceReference(quoteId: string, kind: InvoiceKind): string {
  const suffix = kind === "initial" ? "R" : kind === "service" ? "S" : "F";
  return `${quoteId}-${suffix}`;
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
  // "scheduled" is a service-call-only stage (new builds never set it). This
  // function is for new-build lifecycle; a service call should use
  // serviceLifecycleStage. Defensively map a stray "scheduled" to "accepted"
  // so the new-build pipeline never renders an unknown stage.
  if (status === "scheduled") return "accepted";
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

// Map a SERVICE-CALL quote to its simpler 4-stage lifecycle: Quote / Accepted /
// Scheduled / Paid. "quote" collapses draft+prepared; "scheduled" is a manual
// status advance; "paid" is derived from the single invoice being paid in full
// (which requires it to have been emailed or paid — see invoiceIsReceivable).
// Derived on the fly from the row status + invoice_data + receipts, mirroring
// lifecycleStage above so the dashboard/pipeline always reflect reality.
export function serviceLifecycleStage(
  status: QuoteStatus,
  invoiceData: InvoiceData | null,
  receipts?: InvoiceReceipts
): ServiceLifecycleStage {
  if (invoiceData && isPaidInFull(invoiceData, receipts)) return "paid";
  if (status === "scheduled") return "scheduled";
  if (status === "accepted") return "accepted";
  return "quote";
}