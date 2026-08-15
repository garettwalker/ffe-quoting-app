import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PnlReport } from "@/components/pnl-report";
import { getAllJobPnls } from "@/lib/pnl";

// Aggregated P&L report — every job grouped by quarter/year with period
// subtotals and an overall total, under a chosen revenue basis. INTERNAL ONLY.
// Reads live from Supabase (no caching) so freshly saved cost estimates and
// newly paid invoices show on reload.
export const dynamic = "force-dynamic";

export default async function PnlPage() {
  const { jobs, capped } = await getAllJobPnls();

  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href="/"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to dashboard
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          P&amp;L Report · Internal
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Profit and loss, per job and per quarter.
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Every job&apos;s revenue versus its cost, grouped by quarter. Toggle the
          revenue basis (Contracted for projected margin, Invoiced for accrual,
          Paid for cash). Enter each job&apos;s cost from its Job P&amp;L page.
        </p>
      </div>

      {capped ? (
        <p className="mb-6 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
          This report reached its cap (500 jobs), so older jobs are not included
          and these totals may be undercounting. Raise the cap in lib/pnl.ts to
          fix the count.
        </p>
      ) : null}

      <PnlReport jobs={jobs} />
    </AppShell>
  );
}