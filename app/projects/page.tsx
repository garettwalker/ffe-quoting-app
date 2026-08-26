import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatCurrency } from "@/lib/currency";
import { getSupabaseServer } from "@/lib/supabase-server";
import { loadInvoiceReceipts } from "@/lib/email-log";
import {
  computeProjectStages,
  computeServiceCallStages,
  normalizeProjectStatus,
  type FilterBucket
} from "@/lib/projects";
import { fetchScheduleForQuotes } from "@/lib/projects-server";
import { ProjectStageStrip } from "@/components/project-stage-strip";
import { ServiceStageStrip } from "@/components/service-stage-strip";
import { ProjectAdvanceButton } from "@/components/project-advance-button";
import { ServiceProjectAdvanceButton } from "@/components/service-project-advance-button";
import { ProjectStageEditor } from "@/components/project-stage-editor";
import { normalizeQuoteType, normalizeStatus } from "@/lib/types";
import type { InvoiceData } from "@/lib/types";

// Project Status Tracker. Every ACCEPTED (or scheduled service-call) quote is
// a project. New builds show an 8-stage strip (Quote to Paid); service calls
// show a simpler 5-stage strip (Quote / Accepted / Scheduled / Billed / Paid).
// The 4 new-build field stages are advanced manually here; the billing/paid
// stages are derived from invoice + email-log facts so this view can never
// disagree with /quotes or /receivables. Filter chips narrow by bucket via
// ?filter=. Read-only except the stage-advance / edit-stages controls, which
// write quotes.project_status (new builds) or quotes.status (service schedule).

export const dynamic = "force-dynamic";

const PROJECTS_LIMIT = 500;

type Row = {
  id: string;
  quote_id: string;
  quote_type: string | null;
  client_name: string;
  project_name: string | null;
  project_street: string;
  project_city: string;
  project_state: string;
  project_zip: string;
  project_type: string;
  square_footage: number | null;
  client_quote_total_cents: number;
  status: string;
  invoice_data: InvoiceData | null;
  project_status: unknown;
  created_at: string;
};

type BucketFilter = "all" | FilterBucket;

const CHIPS: Array<{ key: BucketFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "in_field", label: "In the field" },
  { key: "awaiting_payment", label: "Billing & payment" },
  { key: "completed", label: "Completed" }
];

const EMPTY_RECEIPTS = { initial: null, finish: null, service: null };

export default async function ProjectsPage({
  searchParams
}: {
  searchParams: { filter?: string };
}) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, quote_type, client_name, project_name, project_street, project_city, project_state, project_zip, project_type, square_footage, client_quote_total_cents, status, invoice_data, project_status, created_at"
    )
    // Include "scheduled" so scheduled service calls show up (new builds never
    // set it; service calls use it as a manual stage advance).
    .in("status", ["accepted", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(PROJECTS_LIMIT);

  if (error) {
    return (
      <AppShell>
        <ProjectsHeader />
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load projects from the database. {error.message}
        </p>
      </AppShell>
    );
  }

  const rows = (data ?? []) as Row[];
  const receiptsMap = await loadInvoiceReceipts(rows.map((r) => r.id));
  const crewMap = await fetchScheduleForQuotes(rows.map((r) => r.id));

  type NewBuildJob = {
    row: Row;
    projectStatus: ReturnType<typeof normalizeProjectStatus>;
    stages: ReturnType<typeof computeProjectStages>;
    crew: string[];
  };
  type ServiceJob = {
    row: Row;
    stages: ReturnType<typeof computeServiceCallStages>;
    crew: string[];
  };

  const newBuildJobs: NewBuildJob[] = [];
  const serviceJobs: ServiceJob[] = [];

  for (const row of rows) {
    const receipts = receiptsMap.get(row.id) ?? EMPTY_RECEIPTS;
    const crew = crewMap.get(row.id) ?? [];
    if (normalizeQuoteType(row.quote_type) === "service_call") {
      serviceJobs.push({
        row,
        crew,
        stages: computeServiceCallStages({
          createdAt: row.created_at,
          status: normalizeStatus(row.status),
          invoiceData: row.invoice_data,
          receipts
        })
      });
    } else {
      const projectStatus = normalizeProjectStatus(row.project_status);
      newBuildJobs.push({
        row,
        crew,
        projectStatus,
        stages: computeProjectStages({
          createdAt: row.created_at,
          projectStatus,
          invoiceData: row.invoice_data,
          receipts
        })
      });
    }
  }

  // Combined bucket counts across both sections so the chips reflect every
  // accepted job regardless of type.
  const counts: Record<BucketFilter, number> = {
    all: newBuildJobs.length + serviceJobs.length,
    in_field: 0,
    awaiting_payment: 0,
    completed: 0
  };
  for (const j of newBuildJobs) counts[j.stages.filterBucket] += 1;
  for (const j of serviceJobs) counts[j.stages.filterBucket] += 1;

  const selected: BucketFilter =
    searchParams.filter && CHIPS.some((c) => c.key === searchParams.filter)
      ? (searchParams.filter as BucketFilter)
      : "all";
  const visibleNewBuilds =
    selected === "all"
      ? newBuildJobs
      : newBuildJobs.filter((j) => j.stages.filterBucket === selected);
  const visibleService =
    selected === "all"
      ? serviceJobs
      : serviceJobs.filter((j) => j.stages.filterBucket === selected);

  const capped = rows.length >= PROJECTS_LIMIT;
  const nothingVisible =
    visibleNewBuilds.length === 0 && visibleService.length === 0;

  return (
    <AppShell>
      <ProjectsHeader />

      {capped ? (
        <p className="mb-6 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
          This view reached its cap ({PROJECTS_LIMIT} accepted jobs), so older
          jobs are not included. Raise the cap in app/projects/page.tsx to fix it.
        </p>
      ) : null}

      <div className="mb-8 flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const active = chip.key === selected;
          return (
            <Link
              key={chip.key}
              href={chip.key === "all" ? "/projects" : `/projects?filter=${chip.key}`}
              className={`rounded-full border px-4 py-2 text-sm font-black transition-colors ${
                active
                  ? "border-pine bg-pine text-whitewarm"
                  : "border-pine/15 bg-whitewarm text-charcoal hover:bg-cream"
              }`}
            >
              {chip.label}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[chip.key]}</span>
            </Link>
          );
        })}
      </div>

      {nothingVisible ? (
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 shadow-soft">
          <p className="font-bold text-charcoal/70">
            {counts.all === 0
              ? "No accepted jobs yet. Accept a quote and it will show up here."
              : "No jobs in this bucket."}
          </p>
        </section>
      ) : null}

      {visibleNewBuilds.length > 0 ? (
        <div className="mb-8">
          <h3 className="mb-4 font-display text-2xl font-bold tracking-[-0.03em] text-moss">
            New Builds
          </h3>
          <div className="space-y-5">
            {visibleNewBuilds.map((j) => (
              <ProjectCard key={j.row.id} job={j} />
            ))}
          </div>
        </div>
      ) : null}

      {visibleService.length > 0 ? (
        <div className="mb-8">
          <h3 className="mb-4 font-display text-2xl font-bold tracking-[-0.03em] text-moss">
            Service Calls
          </h3>
          <div className="space-y-5">
            {visibleService.map((j) => (
              <ServiceProjectCard key={j.row.id} job={j} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-5 text-xs font-bold text-charcoal/70">
        <span className="inline-flex items-center gap-2">
          <i className="h-[13px] w-[13px] rounded-full border-2 border-sage bg-sage" />
          Completed
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="h-[13px] w-[13px] rounded-full border-2 border-clay bg-cream" />
          Current stage
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="h-[13px] w-[13px] rounded-full border-2 border-stone bg-whitewarm" />
          Upcoming
        </span>
      </div>
    </AppShell>
  );
}

function ProjectsHeader() {
  return (
    <div className="mb-8">
      <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
        Projects
      </p>
      <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
        Every job, quote to paid.
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
        Each accepted job tracked end-to-end through field stages and billing.
        New builds show an 8-stage strip; service calls show a simpler 5-stage
        strip. Mark a stage complete to advance it; billing and paid stages
        update automatically from invoicing.
      </p>
    </div>
  );
}

function ProjectCard({
  job
}: {
  job: {
    row: Row;
    projectStatus: ReturnType<typeof normalizeProjectStatus>;
    stages: ReturnType<typeof computeProjectStages>;
    crew: string[];
  };
}) {
  const { row, projectStatus, stages, crew } = job;
  const jobName = row.project_name || row.client_name || "Untitled";
  const subName = row.project_name ? row.client_name : null;
  const address = [
    row.project_street,
    [row.project_city, row.project_state, row.project_zip]
      .filter(Boolean)
      .join(" ")
  ]
    .filter(Boolean)
    .join(" · ");
  const meta = [
    address,
    row.project_type,
    row.square_footage ? `${row.square_footage.toLocaleString()} sq ft` : null
  ]
    .filter(Boolean)
    .join(" · ");

  const activeStage = stages.stages.find((s) => s.id === stages.activeStageId) ?? null;
  const stageNowLabel = activeStage ? activeStage.label : "Completed";
  const completed = stages.activeStageId === null;

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold text-deep-pine">
            {jobName}
          </p>
          {subName ? (
            <p className="text-sm font-bold text-charcoal/60">{subName}</p>
          ) : null}
          <p className="mt-1 text-sm font-bold text-charcoal/55">{meta}</p>
          <p className="mt-2 font-black tabular-nums text-moss">
            Contract {formatCurrency(row.client_quote_total_cents)} · {row.quote_id}
          </p>
        </div>
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] ${
            completed
              ? "bg-moss/15 text-moss"
              : "bg-clay/12 text-clay"
          }`}
        >
          {stageNowLabel}
        </span>
      </div>

      <div className="mt-6">
        <ProjectStageStrip stages={stages.stages} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-pine/8 pt-4">
        <ProjectAdvanceButton
          quoteId={row.id}
          projectStatus={projectStatus}
          activeStageId={stages.activeStageId}
        />
        <Link
          href={`/quotes/${row.id}`}
          className="rounded-full border border-pine/15 bg-cream px-5 py-3 text-sm font-black text-deep-pine hover:bg-sand"
        >
          View quote
        </Link>
        <ProjectStageEditor quoteId={row.id} projectStatus={projectStatus} />
        <span className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-charcoal/65">
          <i className="h-[9px] w-[9px] rounded-full bg-moss" />
          {crew.length > 0 ? `Crew: ${crew.join(", ")}` : "Unassigned"}
        </span>
      </div>
    </section>
  );
}

function ServiceProjectCard({
  job
}: {
  job: {
    row: Row;
    stages: ReturnType<typeof computeServiceCallStages>;
    crew: string[];
  };
}) {
  const { row, stages, crew } = job;
  const jobName = row.project_name || row.client_name || "Untitled";
  const subName = row.project_name ? row.client_name : null;
  const address = [
    row.project_street,
    [row.project_city, row.project_state, row.project_zip]
      .filter(Boolean)
      .join(" ")
  ]
    .filter(Boolean)
    .join(" · ");
  const meta = [address, row.project_type].filter(Boolean).join(" · ");

  const activeStage = stages.stages.find((s) => s.id === stages.activeStageId) ?? null;
  const stageNowLabel = activeStage ? activeStage.label : "Completed";
  const completed = stages.activeStageId === null;

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold text-deep-pine">
            {jobName}
          </p>
          {subName ? (
            <p className="text-sm font-bold text-charcoal/60">{subName}</p>
          ) : null}
          <p className="mt-1 text-sm font-bold text-charcoal/55">{meta}</p>
          <p className="mt-2 font-black tabular-nums text-moss">
            Invoice {formatCurrency(row.client_quote_total_cents)} · {row.quote_id}
          </p>
        </div>
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] ${
            completed
              ? "bg-moss/15 text-moss"
              : "bg-clay/12 text-clay"
          }`}
        >
          {stageNowLabel}
        </span>
      </div>

      <div className="mt-6">
        <ServiceStageStrip stages={stages.stages} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-pine/8 pt-4">
        <ServiceProjectAdvanceButton
          quoteId={row.id}
          activeStageId={stages.activeStageId}
        />
        <Link
          href={`/quotes/${row.id}`}
          className="rounded-full border border-pine/15 bg-cream px-5 py-3 text-sm font-black text-deep-pine hover:bg-sand"
        >
          View quote
        </Link>
        <span className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-charcoal/65">
          <i className="h-[9px] w-[9px] rounded-full bg-moss" />
          {crew.length > 0 ? `Crew: ${crew.join(", ")}` : "Unassigned"}
        </span>
      </div>
    </section>
  );
}