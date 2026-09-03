"use client";

import { formatCurrency } from "@/lib/currency";
import { MoneyStats } from "@/lib/dashboard-stats";

export function MoneyHero({ stats }: { stats: MoneyStats }) {
  const { outstandingTotalCents, collectedThisMonthCents, paidInFullCount, aging } = stats;

  const total = outstandingTotalCents;
  const current = aging.current;
  const thirty = aging.thirtyDays;
  const sixty = aging.sixtyDays;
  const ninetyPlus = aging.ninetyPlus;

  // Calculate percentages for the aging bar
  const getWidth = (val: number) => (total > 0 ? (val / total) * 100 : 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Outstanding Tile */}
      <div className="lg:col-span-2 p-6 rounded-3xl bg-whitewarm border border-pine/10 shadow-sm flex flex-col justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-clay mb-1">Outstanding</p>
          <h2 className="text-5xl font-display font-bold text-deep-pine tracking-tight mb-6">
            {formatCurrency(total)}
          </h2>
        </div>

        <div>
          <div className="flex justify-between items-end mb-2">
            <p className="text-xs font-bold text-charcoal/60">Aging Breakdown</p>
          </div>
          <div className="h-3 w-full bg-stone/20 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${getWidth(current)}%`, backgroundColor: "var(--moss)" }}
              className="h-full transition-all duration-500"
              title={`Current: ${formatCurrency(current)}`}
            />
            <div
              style={{ width: `${getWidth(thirty)}%`, backgroundColor: "var(--sage)" }}
              className="h-full transition-all duration-500"
              title={`30 Days: ${formatCurrency(thirty)}`}
            />
            <div
              style={{ width: `${getWidth(sixty)}%`, backgroundColor: "var(--clay)" }}
              className="h-full transition-all duration-500"
              title={`60 Days: ${formatCurrency(sixty)}`}
            />
            <div
              style={{ width: `${getWidth(ninetyPlus)}%`, backgroundColor: "var(--deep-pine)" }}
              className="h-full transition-all duration-500"
              title={`90+ Days: ${formatCurrency(ninetyPlus)}`}
            />
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--moss)]" />
              <span className="text-[11px] font-bold text-charcoal/70">Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--sage)]" />
              <span className="text-[11px] font-bold text-charcoal/70">30d</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--clay)]" />
              <span className="text-[11px] font-bold text-charcoal/70">60d</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--deep-pine)]" />
              <span className="text-[11px] font-bold text-charcoal/70">90d+</span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPI Tiles */}
      <div className="grid grid-cols-1 gap-4">
        <div className="p-6 rounded-3xl bg-whitewarm border border-pine/10 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-clay mb-1">Collected this month</p>
          <h3 className="text-3xl font-display font-bold text-deep-pine tracking-tight">
            {formatCurrency(collectedThisMonthCents)}
          </h3>
        </div>
        <div className="p-6 rounded-3xl bg-whitewarm border border-pine/10 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-clay mb-1">Paid in full</p>
          <h3 className="text-3xl font-display font-bold text-deep-pine tracking-tight">
            {paidInFullCount} <span className="text-sm font-normal text-charcoal/50">Jobs</span>
          </h3>
        </div>
      </div>
    </div>
  );
}
