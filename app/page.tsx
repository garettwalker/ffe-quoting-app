import { AppShell } from "@/components/app-shell";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Dashboard
          </p>
          <h2 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
            Quote Home
          </h2>
        </div>

        <div className="rounded-full border border-pine/10 bg-whitewarm/65 px-4 py-2 text-sm font-bold text-charcoal/70">
          Local build mode
        </div>
      </div>

      <DashboardEmptyState />
    </AppShell>
  );
}
