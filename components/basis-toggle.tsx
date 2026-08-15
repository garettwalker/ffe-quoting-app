"use client";

import type { CostBasis } from "@/lib/cost-estimate";

// Shared revenue-basis toggle for the P&L views. Three pill buttons —
// Contracted / Invoiced / Paid — that pick which revenue figure the whole view
// calculates under. Styled like the receivables period buttons. Default basis
// is "invoiced" (the standard accrual P&L); flip to "contracted" to see
// projected margin on a not-yet-invoiced job, or "paid" for cash basis.

const OPTIONS: { value: CostBasis; label: string; hint: string }[] = [
  { value: "contracted", label: "Contracted", hint: "Quote total (projected)" },
  { value: "invoiced", label: "Invoiced", hint: "Billed (accrual)" },
  { value: "paid", label: "Paid", hint: "Cash collected" }
];

export function BasisToggle({
  value,
  onChange
}: {
  value: CostBasis;
  onChange: (basis: CostBasis) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Revenue basis">
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            title={option.hint}
            className={
              selected
                ? "rounded-full bg-pine px-4 py-2 text-sm font-black text-whitewarm shadow-card"
                : "rounded-full border border-pine/20 bg-whitewarm px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine/10"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}