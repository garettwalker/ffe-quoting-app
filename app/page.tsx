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
03em] text-moss">
              Latest quotes
            </h2>
          </div>
          <Link
            href="/quotes"
            className="text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
          >
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="rounded-xl1 border border-pine/10 bg-cream p-5 text-sm font-bold text-charcoal/60">
            No quotes yet. Start a new quote to see it here.
          </p>
        ) : (
          <div className="grid gap-3">
            {recent.map((row) => (
              <RecentQuoteRow
                key={row.id}
                row={row}
                receipts={receiptsOf(row.id)}
              />
            ))}
          </div>
        )}
      </section>
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

function Tile({
  href,
  eyebrow,
  title,
  value,
  sub,
  emphasize
}: {
  href: string;
  eyebrow: string;
  title: string;
  value: string;
  sub: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        emphasize
          ? "focus-ring block rounded-xl2 border border-clay/30 bg-clay/10 p-5 shadow-soft transition hover:-translate-y-0.5"
          : "focus-ring block rounded-xl2 border border-pine/10 bg-whitewarm/75 p-5 shadow-soft transition hover:-translate-y-0.5"
      }
    >
      <p className="mb-1 text-xs font-black uppercase tracking-[0.16em] text-clay">
        {eyebrow}
      </p>
      <p className="font-display text-2xl font-bold tracking-[-0.02em] text-charcoal/60">
        {title}
      </p>
      <p
        className={
          emphasize
            ? "mt-2 font-display text-3xl font-bold text-clay"
            : "mt-2 font-display text-3xl font-bold text-deep-pine"
        }
      >
        {value}
      </p>
      <p className="mt-1 text-sm font-bold text-charcoal/60">{sub}</p>
    </Link>
  );
}

function RecentQuoteRow({
  row,
  receipts
}: {
  row: DashboardQuoteRow;
  receipts?: InvoiceReceipts;
}) {
  const address = [
    row.project_street,
    row.project_city,
    row.project_state,
    row.project_zip
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/quotes/${row.id}`}
      className="focus-ring block rounded-xl1 border border-pine/10 bg-cream p-4 transition hover:bg-sand/60"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-deep-pine">{row.quote_id}</span>
            <StatusBadge
              stage={
                normalizeQuoteType(row.quote_type) === "service_call"
                  ? serviceLifecycleStage(
                      normalizeStatus(row.status),
                      row.invoice_data,
                      receipts
                    )
                  : lifecycleStage(
                      normalizeStatus(row.status),
                      row.invoice_data,
                      receipts
                    )
              }
            />
          </div>
          <p className="mt-1 font-bold text-charcoal">
            {row.project_name || row.client_name}
          </p>
          {row.project_name ? (
            <p className="text-sm text-charcoal/60">{row.client_name}</p>
          ) : null}
          {address ? (
            <p className="text-sm text-charcoal/70">{address}</p>
          ) : null}
        </div>
        <p className="font-display text-lg font-bold text-deep-pine md:text-right">
          {formatCurrency(row.client_quote_total_cents)}
        </p>
      </div>
    </Link>
  );
}