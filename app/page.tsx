import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardResumeActiveQuote } from "@/components/dashboard-active-quote";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/currency";
import {
  lifecycleStage,
  outstandingCents
} from "@/lib/invoice-calculations";
import { supabase } from "@/lib/supabase";
import type { DashboardQuoteRow, QuoteStatus } from "@/lib/types";

// Overview dashboard: the landing hub for the whole app. At-a-glance tiles
// link into each tool — Quotes (the lifecycle pipeline at /quotes), Receivables
// (collections), and Pricing admin — plus quick actions and the most recent
// quotes. Reads live from Supabase so totals track the latest invoice state.
export const dynamic = "force-dynamic";

const RECENT_COUNT = 5;

export default async function DashboardPage() {
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, quote_date, client_name, project_street, project_city, project_state, project_zip, project_type, client_quote_total_cents, status, invoice_data, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <AppShell>
        <DashboardHeader />
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load quotes from the database. {error.message}
        </p>
      </AppShell>
    );
  }

  const rows = (data ?? []) as DashboardQuoteRow[];
  const stageOf = (row: DashboardQuoteRow) =>
    lifecycleStage(normalizeStatus(row.status), row.invoice_data);

  const activeQuotes = rows.filter(
    (row) => stageOf(row) === "draft" || stageOf(row) === "prepared"
  ).length;
  const pendingJobs = rows.filter((row) => stageOf(row) === "pending_payment");
  const paidJobs = rows.filter((row) => stageOf(row) === "paid_in_full");
  const totalOutstanding = pendingJobs.reduce(
    (sum, row) => sum + outstandingCents(row.invoice_data),
    0
  );

  const recent = rows.slice(0, RECENT_COUNT);

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

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          href="/quotes"
          eyebrow="Quoting"
          title="Active quotes"
          value={String(activeQuotes)}
          sub="Drafts and prepared, ready to work"
        />
        <Tile
          href="/receivables"
          eyebrow="Collections"
          title="Awaiting payment"
          value={formatCurrency(totalOutstanding)}
          sub={`${pendingJobs.length} job${pendingJobs.length === 1 ? "" : "s"} outstanding`}
          emphasize={totalOutstanding > 0}
        />
        <Tile
          href="/receivables"
          eyebrow="Collections"
          title="Paid in full"
          value={String(paidJobs.length)}
          sub="Jobs fully collected"
        />
        <Tile
          href="/pricing-admin"
          eyebrow="Config"
          title="Manage pricing"
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
              <RecentQuoteRow key={row.id} row={row} />
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

function RecentQuoteRow({ row }: { row: DashboardQuoteRow }) {
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
              stage={lifecycleStage(normalizeStatus(row.status), row.invoice_data)}
            />
          </div>
          <p className="mt-1 font-bold text-charcoal">{row.client_name}</p>
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

function normalizeStatus(value: unknown): QuoteStatus {
  if (value === "draft" || value === "prepared" || value === "accepted") {
    return value;
  }
  // Anything unexpected (including legacy "completed") is treated as prepared
  // so the owner still sees it. The SQL migration moves completed rows to
  // prepared before deploy.
  return "prepared";
}