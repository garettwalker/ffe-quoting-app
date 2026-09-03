import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardResumeActiveQuote } from "@/components/dashboard-active-quote";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/currency";
import { getDashboardStats } from "@/lib/dashboard-stats";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  lifecycleStage,
  serviceLifecycleStage
} from "@/lib/invoice-calculations";
import { loadInvoiceReceipts, type InvoiceReceipts } from "@/lib/email-log";
import { normalizeQuoteType, normalizeStatus } from "@/lib/types";
import type { DashboardQuoteRow } from "@/lib/types";

// Overview dashboard: a landing page, not an analytics view. A tile for every
// nav-menu location (with a live stat where one is cheap) so the first screen
// after login doubles as fast navigation, then the most recent quotes below.
export const dynamic = "force-dynamic";

const RECENT_COUNT = 8;

export default async function DashboardPage() {
  const supabase = getSupabaseServer();
  const [statsRes, activeCountRes, customersRes, recentRes] = await Promise.all([
    getDashboardStats(),
    // Active quotes = exact count of draft + prepared (head-only).
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "prepared"]),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true }),
    // Recent list = the latest few quotes (full columns for the cards).
    supabase
      .from("quotes")
      .select(
        "id, quote_id, quote_type, quote_date, client_name, project_name, project_street, project_city, project_state, project_zip, project_type, client_quote_total_cents, status, invoice_data, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(RECENT_COUNT)
  ]);

  const firstError =
    activeCountRes.error || customersRes.error || recentRes.error;
  if (firstError) {
    return (
      <AppShell>
        <DashboardHeader />
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load the dashboard. {firstError.message}
        </p>
      </AppShell>
    );
  }

  const stats = statsRes;
  const activeQuotes = activeCountRes.count ?? 0;
  const customers = customersRes.count ?? 0;
  const recent = (recentRes.data ?? []) as DashboardQuoteRow[];

  // Emailed-state for the recent rows, so lifecycle badges show the real
  // money stage. Missing entries default to "never emailed".
  const receiptsMap = await loadInvoiceReceipts(recent.map((row) => row.id));
  const receiptsOf = (id: string): InvoiceReceipts =>
    receiptsMap.get(id) ?? { initial: null, finish: null, service: null };

  return (
    <AppShell>
      <DashboardHeader />

      <DashboardResumeActiveQuote />

      <div className="mb-8">
        <Link
          href="/quotes/new"
          className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card transition hover:-translate-y-0.5 hover:bg-deep-pine"
        >
          Start New Quote
        </Link>
      </div>

      {/* One tile per nav-menu location, mirroring the Work / Money / Setup
          groups in the nav. Values are live where they are cheap to fetch. */}
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          href="/quotes"
          eyebrow="Work"
          title="Quotes"
          value={String(activeQuotes)}
          sub={`${activeQuotes === 1 ? "Quote" : "Quotes"} in draft or prepared`}
        />
        <Tile
          href="/customers"
          eyebrow="Work"
          title="Customers"
          value={String(customers)}
          sub="Builders and paying parties"
        />
        <Tile
          href="/schedule"
          eyebrow="Work"
          title="Schedule"
          value={String(stats.week.length)}
          sub="Crew jobs this week"
        />
        <Tile
          href="/projects"
          eyebrow="Work"
          title="Projects"
          value={String(stats.funnel.inProgress)}
          sub="Jobs currently in progress"
        />
        <Tile
          href="/receivables"
          eyebrow="Money"
          title="Receivables"
          value={formatCurrency(stats.money.outstandingTotalCents)}
          sub="Outstanding now"
          emphasize={stats.money.outstandingTotalCents > 0}
        />
        <Tile
          href="/pnl"
          eyebrow="Money"
          title="P&L Report"
          value="Open"
          sub="Profit and loss by period"
        />
        <Tile
          href="/email-log"
          eyebrow="Money"
          title="Email Log"
          value="Open"
          sub="Quotes and invoices sent"
        />
        <Tile
          href="/pricing-admin"
          eyebrow="Setup"
          title="Pricing Admin"
          value="Open"
          sub="Items, levels, business info"
        />
      </div>

      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Recent
            </p>
            <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
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