import type {
  InvoiceStatus,
  LifecycleStage,
  ServiceLifecycleStage
} from "@/lib/types";

// New-build lifecycle stages + service-call lifecycle stages share the same
// badge component. The "accepted" and "paid" labels/styles overlap by design
// (a service call that is accepted or paid reads the same as a new build).
type BadgeStage = LifecycleStage | ServiceLifecycleStage;

const STAGE_STYLES: Record<BadgeStage, string> = {
  draft: "bg-sand text-deep-pine",
  prepared: "bg-sage/40 text-deep-pine",
  accepted: "bg-pine text-whitewarm",
  pending_payment: "bg-clay/20 text-clay",
  paid_in_full: "bg-moss text-whitewarm",
  // Service-call stages
  quote: "bg-sand text-deep-pine",
  scheduled: "bg-clay/20 text-clay",
  paid: "bg-moss text-whitewarm"
};

const STAGE_LABELS: Record<BadgeStage, string> = {
  draft: "Draft",
  prepared: "Prepared",
  accepted: "Accepted",
  pending_payment: "Pending Payments",
  paid_in_full: "Paid in Full",
  // Service-call stages. "quote" collapses draft+prepared for service calls.
  quote: "Quote",
  scheduled: "Scheduled",
  paid: "Paid"
};

export function StatusBadge({ stage }: { stage: BadgeStage }) {
  const style = STAGE_STYLES[stage] ?? "bg-stone text-deep-pine";
  const label = STAGE_LABELS[stage] ?? stage;

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${style}`}
    >
      {label}
    </span>
  );
}

const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  unpaid: "bg-sand text-deep-pine",
  paid: "bg-pine text-whitewarm"
};

// Invoice paid badge. Reads the invoice's collected amount, so a partially
// collected invoice shows "Partial" instead of the plain "Unpaid" it used to
// (its status stays "unpaid" until the full amount is in, by design). The
// optional paidCents prop is what makes that distinction: callers that only
// have a status still render correctly.
export function InvoicePaidBadge({
  status,
  paidCents = 0
}: {
  status: InvoiceStatus;
  paidCents?: number;
}) {
  const collected = Math.max(0, Math.round(paidCents) || 0);
  const isPartial = status !== "paid" && collected > 0;
  const style = isPartial
    ? "bg-clay/25 text-clay"
    : INVOICE_STATUS_STYLES[status];

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${style}`}
    >
      {isPartial ? "Partial" : status === "paid" ? "Paid" : "Unpaid"}
    </span>
  );
}