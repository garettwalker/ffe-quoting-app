import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardResumeActiveQuote } from "@/components/dashboard-active-quote";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/currency";
import {
  lifecycleStage,
  outstandingCents
} from "@/lib/invoice-calculations";
import { getSupabaseServer } from "@/lib/supabase-server";
import { normalizeStatus } from "@/lib/types";
import type { DashboardQuoteRow, InvoiceData } from "@/lib/types";

// Overview dashboard: the landing hub for the whole app. At-a-glance tiles
// link into each tool — Quotes (the lifecycle pipeline at /quotes), Receivables
// (collections), and Pricing admin — plus quick actions and the most recent
// quotes. Reads live from Supabase so totals track the latest invoice state.
export const dynamic = "force-dynamic";

const RECENT_COUNT = 5;
// Ceiling on the money-tiles query (accepted quotes with invoice setup). High
// enough that it won't bite for a long time; if it's ever reached the tiles
// would undercount, so a warning renders when the result hits this cap.
const MONEY_LIMIT = 500;

export default async function DashboardPage() {
  const supabase = getSupabaseServer();
  // Three queries so the tiles are accurate at any volume instead of being
  // derived from the most-recent rows:
  //   1. Active quotes = exact count of draft + prepared (head-only).
  //   2. Money tiles = accepted quotes with invoice setup, newest first. Only
  //      accepted quotes can be Pending Payments or Paid in Full, and these
  //      are the only rows the money math needs.
  //   3. Recent list = the latest few quotes (full columns for the cards).
  const [activeCountRes, moneyRes, recentRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "prepared"]),
    supabase
      .from("quotes")
      .select("invoice_data, created_at")
      .eq("status", "accepted")
      .not("invoice_data", "is", null)
      .order("created_at", { ascending: false })
      .limit(MONEY_LIMIT),
    supabase
      .from("quotes")
      .select(
        "id, quote_id, quote_date, client_name, project_street, project_city, project_state, project_zip, project_type, client_quote_total_cents, status, invoice_data, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(RECENT_COUNT)
  ]);

  const firstError = activeCountRes.error || moneyRes.error || recentRes.error;
  if (firstError) {
    return (
      <AppShell>
        <DashboardHeader />
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load quotes from the database. {firstError.message}
        </p>
      </AppShell>
    );
  }

  const activeQuotes = activeCountRes.count ?? 0;

  // Money tiles from the accepted+invoiced rows. All of these are status
  // "accepted", so the stage is derived purely from the invoice setup.
  const moneyRows = (moneyRes.data ?? []) as {
    invoice_data: InvoiceData | null;
  }[];
  const moneyStageOf = (row: { invoice_data: InvoiceData | null }) =>
    lifecycleStage("accepted", row.invoice_data);
  const pendingJobs = moneyRows.filter(
    (row) => moneyStageOf(row) === "pending_payment"
  );
  const paidJobs = moneyRows.filter(
    (row) => moneyStageOf(row) === "paid_in_full"
  );
  const totalOutstanding = pendingJobs.reduce(
    (sum, row) => sum + outstandingCents(row.invoice_data),
    0
  );
  // If the money query hit its cap, the tiles may undercount (there could be
  // more accepted+invoiced jobs beyond the cap). Surface a warning so the owner
  // knows to raise MONEY_LIMIT.
  const moneyCapped = moneyRows.length >= MONEY_LIMIT;

  const recent = (recentRes.data ?? []) as DashboardQuoteRow[];

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

      {moneyCapped ? (
        <p className="mb-8 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
          The collections tiles reached their internal cap ({MONEY_LIMIT} accepted
          invoiced jobs), so these totals may be undercounting. Raise the cap in
          app/page.tsx to fix the count.
        </p>
      ) : null}

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