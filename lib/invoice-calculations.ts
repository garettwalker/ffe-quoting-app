import type { InvoiceData, InvoiceKind, InvoiceRecord, LifecycleStage, QuoteStatus } from "@/lib/types";

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
export function computeInvoiceAmounts(data: InvoiceData): InvoiceAmounts {
  const contract = Math.max(0, Math.round(data.contractAmountCents));
  const roughInPercent = clampPercent(data.roughInPercent);
  const finishPercent = clampPercent(data.finishPercent);
  const permitFeeCents = Math.max(0, Math.round(data.permitFeeCents));
  const percentTotal = roughInPercent + finishPercent;

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

// Sum of amounts for invoices that are still unpaid (the outstanding balance).
export function outstandingCents(data: InvoiceData | null): number {
  if (!data) return 0;
  return data.invoices
    .filter((invoice) => invoice.status === "unpaid")
    .reduce((sum, invoice) => sum + (Math.round(invoice.amountCents) || 0), 0);
}

// Per-invoice outstanding: the invoice amount when still unpaid, 0 once paid.
// Used by the Accounts Receivable view's per-invoice (rough-in / finish) columns.
export function invoiceOutstandingCents(invoice: InvoiceRecord): number {
  return invoice.status === "unpaid"
    ? Math.round(invoice.amountCents) || 0
    : 0;
}

// True when every invoice is paid.
export function isFullyPaid(data: InvoiceData | null): boolean {
  if (!data) return false;
  return data.invoices.length > 0 && data.invoices.every((invoice) => invoice.status === "paid");
}

// Find a single invoice record by kind, with a safe fallback.
export function findInvoice(data: InvoiceData, kind: InvoiceKind) {
  return data.invoices.find((invoice) => invoice.kind === kind) ?? null;
}

// The invoice reference shown to the customer, e.g. Q-20260619-001-R.
export function invoiceReference(quoteId: string, kind: InvoiceKind): string {
  return `${quoteId}-${kind === "initial" ? "R" : "F"}`;
}

// Map a quote to its dashboard lifecycle stage. Accepted quotes split into
// three sub-stages based on the invoice setup: no invoices set up yet =
// Client Accepted, invoices with money still outstanding = Pending Payments,
// every invoice paid = Paid in Full. draft and prepared pass through
// unchanged. This is derived on the fly from the row status + invoice_data,
// so the dashboard always reflects reality without extra status writes.
export function lifecycleStage(
  status: QuoteStatus,
  invoiceData: InvoiceData | null
): LifecycleStage {
  if (status !== "accepted") return status;
  if (!invoiceData) return "accepted";
  return isFullyPaid(invoiceData) ? "paid_in_full" : "pending_payment";
}