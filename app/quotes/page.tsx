import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardQuoteSection } from "@/components/dashboard-quote-section";
import {
  lifecycleStage,
  serviceLifecycleStage
} from "@/lib/invoice-calculations";
import { loadInvoiceReceipts } from "@/lib/email-log";
import { getSupabaseServer } from "@/lib/supabase-server";
import { normalizeQuoteType, normalizeStatus } from "@/lib/types";
import type { DashboardQuoteRow } from "@/lib/types";

// The quoting tool: the full quote lifecycle pipeline, reading saved quotes
// from Supabase. The overview dashboard at `/` is the landing hub; this page is
// where the day-to-day quoting work lives. A type toggle (New builds / Service
// calls / All) filters the pipeline: new builds show the 5-stage lifecycle,
// service calls show their simpler 4-stage lifecycle, All stacks both.
export const dynamic = "force-dynamic";

// Ceiling on how many quotes the pipeline loads. High enough that every
// non-archived quote shows up in some stage for a long time; if it's ever
// reached a warning renders so the owner knows older quotes are dropped
// and the cap should be raised.
const PIPELINE_LIMIT = 500;

type PipelineFilter = "new_builds" | "service_calls" | "all";

function parseFilter(value: string | undefined): PipelineFilter {
  if (value === "new_builds" || value === "service_calls" || value === "all") {
    return value;
  }
  return "all";
}

export default async function QuotesPage({
  searchParams
}: {
  searchParams: { type?: string };
}) {
  const filter = parseFilter(searchParams.type);

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, quote_date, quote_type, client_name, project_name, project_street, project_city, project_state, project_zip, project_type, client_quote_total_cents, status, invoice_data, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(PIPELINE_LIMIT);

  if (error) {
    return (
      <AppShell>
        <QuotesHeader filter={filter} />
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load quotes from the database. {error.message}
        </p>
      </AppShell>
    );
  }

  const rows = (data ?? []) as DashboardQuoteRow[];
  // One batched lookup for the emailed-state of every invoice on the loaded
  // quotes. A finish/service that has never been emailed (and isn't paid) is
  // excluded from outstanding + keeps the job out of Paid in Full.
  const receiptsById = await loadInvoiceReceipts(rows.map((row) => row.id));

  // Partition by quote type. Old rows default to new_build (normalizeQuoteType).
  const newBuildRows = rows.filter(
    (row) => normalizeQuoteType(row.quote_type) === "new_build"
  );
  const serviceRows = rows.filter(
    (row) => normalizeQuoteType(row.quote_type) === "service_call"
  );

  // New-build lifecycle stage (5 stages). Accepted derives a sub-stage from the
  // invoice setup; a not-yet-emailed finish is "scheduled" (not owed yet), so a
  // rough-in paid / finish-scheduled job stays in Pending Payments rather than
  // reading as paid in full.
  const newBuildStageOf = (row: DashboardQuoteRow) =>
    lifecycleStage(
      normalizeStatus(row.status),
      row.invoice_data,
      receiptsById.get(row.id)
    );

  // Service-call lifecycle stage (4 stages): Quote / Accepted / Scheduled / Paid.
  const serviceStageOf = (row: DashboardQuoteRow) =>
    serviceLifecycleStage(
      normalizeStatus(row.status),
      row.invoice_data,
      receiptsById.get(row.id)
    );

  // True when the query hit its cap: quotes older than the cap are dropped and
  // won't appear in any stage. Tell the owner so they can raise PIPELINE_LIMIT.
  const capped = rows.length >= PIPELINE_LIMIT;

  const showNewBuilds = filter === "new_builds" || filter === "all";
  const showService = filter === "service_calls" || filter === "all";

  // --- New build sections -------------------------------------------------
  const nbDrafts = newBuildRows.filter((r) => newBuildStageOf(r) === "draft");
  const nbPrepared = newBuildRows.filter((r) => newBuildStageOf(r) === "prepared");
  const nbAccepted = newBuildRows.filter((r) => newBuildStageOf(r) === "accepted");
  const nbPending = newBuildRows.filter((r) => newBuildStageOf(r) === "pending_payment");
  const nbPaid = newBuildRows.filter((r) => newBuildStageOf(r) === "paid_in_full");

  // --- Service call sections ---------------------------------------------
  const svcQuote = serviceRows.filter((r) => serviceStageOf(r) === "quote");
  const svcAccepted = serviceRows.filter((r) => serviceStageOf(r) === "accepted");
  const svcScheduled = serviceRows.filter((r) => serviceStageOf(r) === "scheduled");
  const svcPaid = serviceRows.filter((r) => serviceStageOf(r) === "paid");

  return (
    <AppShell>
      <QuotesHeader filter={filter} />

      {capped ? (
        <p className="mb-6 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
          The pipeline reached its cap ({PIPELINE_LIMIT} quotes), so quotes older
          than that are not shown in any stage. Raise the cap in
          app/quotes/page.tsx to surface them.
        </p>
      ) : null}

      {showNewBuilds ? (
        <>
          {filter === "all" ? (
            <h3 className="mb-4 font-display text-2xl font-bold tracking-[-0.03em] text-moss">
              New Builds
            </h3>
          ) : null}

          <DashboardQuoteSection
            eyebrow="Stage 1"
            title="Draft"
            description="Quotes you are still working on. Save as a draft to keep them here."
            quotes={nbDrafts}
            emptyCopy="No drafts yet. Start a new quote and save it as a draft to see it here."
            receiptsById={receiptsById}
          />

          <DashboardQuoteSection
            eyebrow="Stage 2"
            title="Prepared"
            description="Ready to share with the client, or edit before sending."
            quotes={nbPrepared}
            emptyCopy="No prepared quotes. When a draft is ready to send, mark it prepared and it appears here."
            receiptsById={receiptsById}
          />

          <DashboardQuoteSection
            eyebrow="Stage 3"
            title="Client Accepted"
            description="Billing and invoicing start here."
            quotes={nbAccepted}
            emptyCopy="No accepted quotes yet. When a client approves, mark a prepared quote accepted and it appears here. Invoicing starts from this stage."
            receiptsById={receiptsById}
          />

          <DashboardQuoteSection
            eyebrow="Stage 4"
            title="Pending Payments"
            description="Accepted quotes with invoices set up. Mark each invoice paid as it comes in."
            quotes={nbPending}
            emptyCopy="No quotes awaiting payment. Set up invoices on an accepted quote and it moves here."
            receiptsById={receiptsById}
          />

          <DashboardQuoteSection
            eyebrow="Stage 5"
            title="Paid in Full"
            description="Every invoice on this job has been paid."
            quotes={nbPaid}
            emptyCopy="No fully paid quotes yet. When every invoice on a job is marked paid, it lands here."
            receiptsById={receiptsById}
          />
        </>
      ) : null}

      {showService ? (
        <>
          {filter === "all" ? (
            <h3 className="mb-4 mt-4 font-display text-2xl font-bold tracking-[-0.03em] text-moss">
              Service Calls
            </h3>
          ) : null}

          <DashboardQuoteSection
            eyebrow="Stage 1"
            title="Quote"
            description="Service-call quotes in progress or ready to send."
            quotes={svcQuote}
            emptyCopy="No service-call quotes yet. Start a new quote and choose Service Call to see it here."
            receiptsById={receiptsById}
          />

          <DashboardQuoteSection
            eyebrow="Stage 2"
            title="Accepted"
            description="Client approved. Set up the single service invoice."
            quotes={svcAccepted}
            emptyCopy="No accepted service calls. When a client approves, mark a prepared service quote accepted."
            receiptsById={receiptsById}
          />

          <DashboardQuoteSection
            eyebrow="Stage 3"
            title="Scheduled"
            description="Marked scheduled. Invoice the job when the work is done."
            quotes={svcScheduled}
            emptyCopy="No scheduled service calls. Mark an accepted service call scheduled once the work is booked in."
            receiptsById={receiptsById}
          />

          <DashboardQuoteSection
            eyebrow="Stage 4"
            title="Paid"
            description="The service invoice has been paid in full."
            quotes={svcPaid}
            emptyCopy="No paid service calls yet. When the service invoice is marked paid, it lands here."
            receiptsById={receiptsById}
          />
        </>
      ) : null}
    </AppShell>
  );
}

function QuotesHeader({ filter }: { filter: PipelineFilter }) {
  const toggle = (value: PipelineFilter, label: string) => {
    const active = filter === value;
    return (
      <Link
        href={`/quotes?type=${value}`}
        className={`rounded-full px-4 py-2 text-sm font-black transition ${
          active
            ? "bg-pine text-whitewarm shadow-card"
            : "border border-pine/20 text-deep-pine hover:bg-pine hover:text-whitewarm"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <Link
          href="/"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to dashboard
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Quotes
        </p>

        <h2 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
          Quote Pipeline
        </h2>

        <p className="mt-3 max-w-2xl text-base leading-7 text-charcoal/70">
          Follow a job through its whole life. Filter by type to focus on new
          builds or service calls, or see all together.
        </p>
      </div>

      <div className="flex flex-col items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {toggle("all", "All")}
          {toggle("new_builds", "New builds")}
          {toggle("service_calls", "Service calls")}
        </div>

        <Link
          href="/quotes/new"
          className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card transition hover:-translate-y-0.5 hover:bg-deep-pine"
        >
          Start New Quote
        </Link>
      </div>
    </div>
  );
}