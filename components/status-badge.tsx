import type { QuoteStatus } from "@/lib/types";

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: "bg-sand text-deep-pine",
  prepared: "bg-sage/40 text-deep-pine",
  accepted: "bg-pine text-whitewarm"
};

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  prepared: "Prepared",
  accepted: "Accepted"
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const style = STATUS_STYLES[status] ?? "bg-stone text-deep-pine";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${style}`}
    >
      {label}
    </span>
  );
}