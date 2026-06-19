import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardQuoteSection } from "@/components/dashboard-quote-section";
import { lifecycleStage } from "@/lib/invoice-calculations";
import { supabase } from "@/lib/supabase";
import type { DashboardQuoteRow, QuoteStatus } from "@/lib/types";

// The quoting tool: the full quote lifecycle pipeline (Draft → Prepared →
// Client Accepted → Pending Payments → Paid in Full), reading saved quotes
// from Supabase. The overview dashboard at `/` is the landing hub; this page
// is where the day-to-day quoting work lives.
export const dynamic = "force-dynamic";

export default async function QuotesPage() {
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
        <QuotesHeader />
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load quotes from the database. {error.message}
        </p>
      </AppShell>
    );
  }

  // Group rows in memory by lifecycle stage. Cast status to the union; any
  // unexpected value falls back to "prepared" so the row still renders. For
  // accepted quotes the stage is derived from the invoice setup: no invoices
  // yet = Client Accepted, invoices with money outstanding = Pending Payments,
  // every invoice paid = Paid in Full.
  const rows = (data ?? []) as DashboardQuoteRow[];
  const stageOf = (row: DashboardQuoteRow) =>
    lifecycleStage(normalizeStatus(row.status), row.invoice_data);

  const drafts = rows.filter((row) => stageOf(row) === "draft");
  const prepared = rows.filter((row) => stageOf(row) === "prepared");
  const accepted = rows.filter((row) => stageOf(row) === "accepted");
  const pending = rows.filter((row) => stageOf(row) === "pending_payment");
  const paid = rows.filter((row) => stageOf(row) === "paid_in_full");

  return (
    <AppShell>
      <QuotesHeader />

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
        emptyCopy="No accepted quotes yet. When a client approves, mark a prepared quote accepted and it appears here. Invoicing starts from this stage."
      />

      <DashboardQuoteSection
        eyebrow="Stage 4"
        title="Pending Payments"
        description="Accepted quotes with invoices set up. Mark each invoice paid as it comes in."
        quotes={pending}
        emptyCopy="No quotes awaiting payment. Set up invoices on an accepted quote and it moves here."
      />

      <DashboardQuoteSection
        eyebrow="Stage 5"
        title="Paid in Full"
        description="Every invoice on this job has been paid."
        quotes={paid}
        emptyCopy="No fully paid quotes yet. When every invoice on a job is marked paid, it lands here."
      />
    </AppShell>
  );
}

function QuotesHeader() {
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
          Follow a job through its whole life: draft, prepared, client accepted,
          pending payments, and paid in full.
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