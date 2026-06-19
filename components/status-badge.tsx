import type { InvoiceStatus, LifecycleStage } from "@/lib/types";

const STAGE_STYLES: Record<LifecycleStage, string> = {
  draft: "bg-sand text-deep-pine",
  prepared: "bg-sage/40 text-deep-pine",
  accepted: "bg-pine text-whitewarm",
  pending_payment: "bg-clay/20 text-clay",
  paid_in_full: "bg-moss text-whitewarm"
};

const STAGE_LABELS: Record<LifecycleStage, string> = {
  draft: "Draft",
  prepared: "Prepared",
  accepted: "Accepted",
  pending_payment: "Pending Payments",
  paid_in_full: "Paid in Full"
};

export function StatusBadge({ stage }: { stage: LifecycleStage }) {
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

export function InvoicePaidBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
        INVOICE_STATUS_STYLES[status]
      }`}
    >
      {status === "paid" ? "Paid" : "Unpaid"}
    </span>
  );
}