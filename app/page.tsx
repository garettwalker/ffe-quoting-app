import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardActiveQuote } from "@/components/dashboard-active-quote";
import { DashboardSavedQuotes } from "@/components/dashboard-saved-quotes";
import { DashboardBuildStatus } from "@/components/dashboard-build-status";

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
          <p className="mt-3 max-w-2xl text-base leading-7 text-charcoal/70">
            Start a new quote, continue an active quote, or open a saved quote
            from your history.
          </p>
        </div>

        <Link
          href="/quotes/new"
          className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card transition hover:-translate-y-0.5 hover:bg-deep-pine"
        >
          Start New Quote
        </Link>
      </div>

      <DashboardActiveQuote />
      <DashboardSavedQuotes />

      {/* TEMPORARY - remove this block and the DashboardBuildStatus
          component once the build is complete. */}
      <DashboardBuildStatus />
    </AppShell>
  );
}