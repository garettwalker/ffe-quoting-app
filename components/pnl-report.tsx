"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BasisToggle } from "@/components/basis-toggle";
import { formatCurrency } from "@/lib/currency";
import {
  marginFor,
  revenueForJob,
  type CostBasis,
  type JobPnl
} from "@/lib/cost-estimate";

// Aggregated P&L report. Lists every job grouped by quarter, with period
// subtotals and an overall total, all under a chosen revenue basis. INTERNAL
// ONLY. The server page loads the jobs; this component does the grouping,
// period filtering, and basis switching client-side.

type Period = "all" | "quarter" | "year" | "lastyear";

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
  { value: "lastyear", label: "Last year" }
];

function periodRange(period: Period): { from: number; to: number } | null {
  if (period === "all") return null;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (period === "quarter") {
    const qStart = month - (month % 3);
    return {
      from: new Date(year, qStart, 1).getTime(),
      to: new Date(year, qStart + 3, 1).getTime()
    };
  }
  if (period === "year") {
    return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() };
  }
  // last year
  return { from: new Date(year - 1, 0, 1).getTime(), to: new Date(year, 0, 1).getTime() };
}

function quarterKey(dateStr: string | null): string {
  if (!dateStr) return "Undated";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Undated";
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()} Q${q}`;
}

function quarterSortKey(key: string): number {
  const m = key.match(/^(\d{4}) Q([1-4])$/);
  if (!m) return -Infinity; // Undated sorts last
  return Number(m[1]) * 10 + Number(m[2]);
}

type PeriodGroup = {
  key: string;
  jobs: JobPnl[];
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
};

export function PnlReport({ jobs }: { jobs: JobPnl[] }) {
  const [basis, setBasis] = useState<CostBasis>("invoiced");
  const [period, setPeriod] = useState<Period>("all");

  const { groups, totals } = useMemo(() => {
    const range = periodRange(period);

    const inPeriod = (job: JobPnl) => {
      if (!range) return true;
      if (!job.periodDate) return false;
      const t = new Date(job.periodDate).getTime();
      return t >= range.from && t < range.to;
    };

    const filtered = jobs.filter(inPeriod);

    // Group by quarter, compute per-group totals under the basis.
    const map = new Map<string, PeriodGroup>();
    for (const job of filtered) {
      const key = quarterKey(job.periodDate);
      const g = map.get(key) ?? {
        key,
        jobs: [],
        revenueCents: 0,
        costCents: 0,
        marginCents: 0,
        marginPct: 0
      };
      g.jobs.push(job);
      g.revenueCents += revenueForJob(job, basis);
      g.costCents += job.costCents;
      map.set(key, g);
    }

    const groupsArr = Array.from(map.values()).map((g) => {
      g.marginCents = g.revenueCents - g.costCents;
      g.marginPct = g.revenueCents > 0 ? Math.round((g.marginCents / g.revenueCents) * 100) : 0;
      // Sort jobs within a quarter by revenue desc so the biggest jobs lead.
      g.jobs.sort((a, b) => revenueForJob(b, basis) - revenueForJob(a, basis));
      return g;
    });

    groupsArr.sort((a, b) => quarterSortKey(b.key) - quarterSortKey(a.key));

    const totalRevenue = groupsArr.reduce((s, g) => s + g.revenueCents, 0);
    const totalCost = groupsArr.reduce((s, g) => s + g.costCents, 0);
    const totalMargin = totalRevenue - totalCost;
    const totalMarginPct =
      totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;

    return {
      groups: groupsArr,
      totals: {
        revenueCents: totalRevenue,
        costCents: totalCost,
        marginCents: totalMargin,
        marginPct: totalMarginPct
      }
    };
  }, [jobs, period, basis]);

  const basisLabel =
    basis === "contracted" ? "Contracted"
    : basis === "invoiced" ? "Invoiced"
    : "Paid";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
            Revenue basis
          </p>
          <BasisToggle value={basis} onChange={setBasis} />
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={
                period === option.value
                  ? "rounded-full bg-pine px-4 py-2 text-sm font-black text-whitewarm shadow-card"
                  : "rounded-full border border-pine/20 bg-whitewarm px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine/10"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overall totals */}
      <div className="grid gap-3 sm:grid-cols-4">
        <TotalCard label={`${basisLabel} revenue`} value={formatCurrency(totals.revenueCents)} />
        <TotalCard label="Job cost" value={formatCurrency(totals.costCents)} />
        <TotalCard label="Margin" value={formatCurrency(totals.marginCents)} />
        <TotalCard
          label="Margin %"
          value={`${totals.marginPct}%`}
          tone={totals.marginCents >= 0 ? "good" : "bad"}
        />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 text-sm font-bold text-charcoal/60">
          No jobs in this period.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section
              key={g.key}
              className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft"
            >
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
                  {g.key}
                </h2>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-charcoal/60">
                  <span>{basisLabel}: <span className="text-charcoal">{formatCurrency(g.revenueCents)}</span></span>
                  <span>Cost: <span className="text-charcoal">{formatCurrency(g.costCents)}</span></span>
                  <span className={g.marginCents >= 0 ? "text-deep-pine" : "text-clay"}>
                    Margin: {formatCurrency(g.marginCents)} ({g.marginPct}%)
                  </span>
                </div>
              </div>

              <div className="responsive-table-wrap">
                <table className="responsive-table w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                      <th className="py-2 pr-4 font-black">Job</th>
                      <th className="py-2 pr-4 font-black">{basisLabel} revenue</th>
                      <th className="py-2 pr-4 font-black">Cost</th>
                      <th className="py-2 pr-4 font-black">Margin</th>
                      <th className="py-2 font-black">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.jobs.map((job) => {
                      const m = marginFor(job, basis);
                      return (
                        <tr key={job.jobId} className="border-b border-pine/10 align-top">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/quotes/${job.jobId}/pnl`}
                              className="font-black text-deep-pine underline decoration-clay/40 underline-offset-2 hover:text-clay"
                            >
                              {job.jobName}
                            </Link>
                            <p className="text-xs font-bold text-charcoal/55">
                              {job.clientName ? `${job.clientName} · ` : ""}{job.quoteId}
                            </p>
                          </td>
                          <td className="py-3 pr-4 font-bold text-charcoal">
                            {formatCurrency(m.revenueCents)}
                          </td>
                          <td className="py-3 pr-4 text-charcoal/70">
                            {formatCurrency(m.costCents)}
                            {!job.hasCost ? (
                              <span className="ml-1 text-[10px] font-black uppercase tracking-wide text-clay/70">est.</span>
                            ) : null}
                          </td>
                          <td className={`py-3 pr-4 font-bold ${m.marginCents >= 0 ? "text-deep-pine" : "text-clay"}`}>
                            {formatCurrency(m.marginCents)}
                          </td>
                          <td className={`py-3 font-bold ${m.marginCents >= 0 ? "text-deep-pine" : "text-clay"}`}>
                            {m.marginPct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TotalCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div
      className={
        tone === "bad"
          ? "rounded-xl2 border border-clay/30 bg-clay/10 p-5 shadow-soft"
          : "rounded-xl2 border border-pine/10 bg-whitewarm/75 p-5 shadow-soft"
      }
    >
      <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
        {label}
      </p>
      <p
        className={
          tone === "bad"
            ? "font-display text-2xl font-bold text-clay"
            : "font-display text-2xl font-bold text-deep-pine"
        }
      >
        {value}
      </p>
    </div>
  );
}