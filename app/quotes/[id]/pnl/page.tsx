import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { JobPnlEditor } from "@/components/job-pnl-editor";
import { getSettings } from "@/lib/pricing";
import {
  buildDefaultCostEstimate,
  normalizeCostEstimate,
  normalizeDefaults
} from "@/lib/cost-estimate";
import { pnlFromRow, type QuotePnlRow } from "@/lib/pnl";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { QuoteFormState } from "@/lib/types";

// Internal per-job P&L view. Reads the quote's existing revenue data (quote
// total, invoices, outstanding) plus any saved cost estimate, and shows
// revenue vs cost vs margin under a chosen basis (Contracted / Invoiced / Paid).
// The owner enters the job's cost (material $ buckets + per-person labor) below.
// INTERNAL ONLY — nothing here appears on customer-facing surfaces.
export const dynamic = "force-dynamic";

export default async function JobPnlPage({
  params
}: {
  params: { id: string };
}) {
  const supabase = getSupabaseServer();
  const [quoteRes, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_id, status, created_at, quote_data, calculation_data, invoice_data, cost_estimate_data"
      )
      .eq("id", params.id)
      .single(),
    getSettings()
  ]);

  if (quoteRes.error || !quoteRes.data) {
    return (
      <AppShell>
        <Link
          href="/quotes"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to quotes
        </Link>
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load this quote. {quoteRes.error?.message ?? "No data."}
        </p>
      </AppShell>
    );
  }

  const row = quoteRes.data as QuotePnlRow;
  const quote = row.quote_data as QuoteFormState;
  const sqft = Math.max(0, Number(quote?.squareFootage ?? 0));

  const defaults = normalizeDefaults(settings.costEstimateDefaults);
  const hasSavedCost = row.cost_estimate_data != null && typeof row.cost_estimate_data === "object";

  // Saved estimate is normalized (tolerates a partial/old shape); otherwise
  // build the default (empty material buckets + a blank labor line) so the
  // editor always has real boxes. sqft is no longer used for materials.
  const initialData = hasSavedCost
    ? normalizeCostEstimate(row.cost_estimate_data, defaults)
    : buildDefaultCostEstimate(sqft, defaults);

  const jobPnl = pnlFromRow(row, defaults);
  const jobName = jobPnl.jobName;

  return (
    <AppShell>
      <Link
        href={`/quotes/${row.id}`}
        className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
      >
        Back to quote
      </Link>

      <div className="mb-6">
        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Job P&amp;L · Internal
        </p>
        <h1 className="font-display text-4xl font-bold tracking-[-0.03em] text-moss md:text-5xl">
          {jobName}
        </h1>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          {jobPnl.clientName ? `${jobPnl.clientName} · ` : ""}Quote {row.quote_id} · {Math.round(sqft).toLocaleString()} sqft
        </p>
      </div>

      <JobPnlEditor
        quoteId={row.id}
        jobPnl={jobPnl}
        hasSavedCost={hasSavedCost}
        initialData={initialData}
        defaults={defaults}
      />
    </AppShell>
  );
}