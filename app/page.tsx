import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardResumeActiveQuote } from "@/components/dashboard-active-quote";
import { getDashboardStats } from "@/lib/dashboard-stats";
import { MoneyHero } from "@/components/dashboard/MoneyHero";
import { PipelineFunnel } from "@/components/dashboard/PipelineFunnel";
import { WeekSummary } from "@/components/dashboard/WeekSummary";

// Overview dashboard: the landing hub for the whole app.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <AppShell>
      <DashboardHeader />

      <DashboardResumeActiveQuote />

      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          href="/quotes/new"
          className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card transition hover:-translate-y-0.5 hover:bg-deep-pine"
        >
          Start New Quote
        </Link>
        <Link
          href="/receivables"
          className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full border border-pine/20 bg-whitewarm px-6 py-3 font-black text-deep-pine shadow-card transition hover:bg-pine/10"
        >
          Receivables
        </Link>
        <Link
          href="/pricing-admin"
          className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full border border-pine/20 bg-whitewarm px-6 py-3 font-black text-deep-pine shadow-card transition hover:bg-pine/10"
        >
          Manage Pricing
        </Link>
      </div>

      <div className="space-y-8">
        <MoneyHero stats={stats.money} />
        <PipelineFunnel counts={stats.funnel} />
        <WeekSummary jobs={stats.week} />
      </div>
    </AppShell>
  );
}

function DashboardHeader() {
  return (
    <div className="mb-8">
      <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
        Dashboard
      </p>
      <h2 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
        Freedom Family Electric
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-7 text-charcoal/70">
        Your quoting, pricing, and receivables in one place. Start a quote,
        check who owes you, or manage your prices.
      </p>
    </div>
  );
}
