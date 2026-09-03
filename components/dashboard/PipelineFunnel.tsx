"use client";

import { FunnelStats } from "@/lib/dashboard-stats";
import { StatusBadge } from "@/components/status-badge";

export function PipelineFunnel({ counts }: { counts: FunnelStats }) {
  const stages = [
    { key: "quotesOut", label: "Quotes Out", color: "text-charcoal/60" },
    { key: "accepted", label: "Accepted", color: "text-moss" },
    { key: "inProgress", label: "In Progress", color: "text-pine" },
    { key: "paid", label: "Paid", color: "text-deep-pine" },
  ] as const;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stages.map((stage) => (
        <div
          key={stage.key}
          className="p-6 rounded-3xl bg-whitewarm border border-pine/10 shadow-sm text-center flex flex-col items-center justify-center gap-2"
        >
          <div className={`text-4xl font-display font-bold ${stage.color}`}>
            {(counts as any)[stage.key]}
          </div>
          <div className="text-xs font-black uppercase tracking-widest text-charcoal/50">
            {stage.label}
          </div>
        </div>
      ))}
    </div>
  );
}
