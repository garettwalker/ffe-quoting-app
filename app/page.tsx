import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardResumeActiveQuote } from "@/components/dashboard-active-quote";
import { DashboardBuildStatus } from "@/components/dashboard-build-status";
import { DashboardQuoteSection } from "@/components/dashboard-quote-section";
import { supabase } from "@/lib/supabase";
import type { DashboardQuoteRow, QuoteStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, quote_date, client_name, project_street, project_city, project_state, project_zip, project_type, client_quote_total_cents, status, created_at"
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

  // Group rows in memory by lifecycle status. Cast status to the union; any
  // unexpected value falls back to "draft" so the row still renders.
  const rows = (data ?? []) as DashboardQuoteRow[];
  const drafts = rows.filter((row) => normalizeStatus(row.status) === "draft");
  const prepared = rows.filter(
    (row) => normalizeStatus(row.status) === "prepared"
  );
  const accepted = rows.filter(
    (row) => normalizeStatus(row.status) === "accepted"
  );

  return (
    <AppShell>
      <DashboardHeader />

      <DashboardResumeActiveQuote />

      <DashboardQuoteSection
        eyebrow="Stage 1"
        title="Draft"
        description="Quotes you are still working on. Save as a draft to keep them here."
        quotes={drafts}
        emptyCopy="No drafts yet. Start a new quote and save it as a draft to see it here."
      />

      <DashboardQuoteSection
        eyebrow="Stage 2"
        title="Prepared"
        description="Ready to share with the client, or edit before sending."
        quotes={prepared}
        emptyCopy="No prepared quotes. When a draft is ready to send, mark it prepared and it appears here."
      />

      <DashboardQuoteSection
        eyebrow="Stage 3"
        title="Client Accepted"
        description="Billing and invoicing start here."
        quotes={accepted}
        emptyCopy="No accepted quotes yet. When a client approves, mark a prepared quote accepted and it appears here. Billing and invoicing start from this stage."
      />

      {/* TEMPORARY - remove this block and the DashboardBuildStatus
          component once the build is complete. */}
      <DashboardBuildStatus />
    </AppShell>
  );
}

function DashboardHeader() {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Dashboard
        </p>
        <h2 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
          Quote Home
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-charcoal/70">
          Start a new quote, continue an active quote, or move quotes through
          the pipeline from draft to prepared to client accepted.
        </p>
      </div>

      <Link
        href="/quotes/new"
        className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card transition hover:-translate-y-0.5 hover:bg-deep-pine"
      >
        Start New Quote
      </Link>
    </div>
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