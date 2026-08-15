// Server-side P&L derivation: turns quote rows into JobPnl records by combining
// the revenue already on the quote (contracted total, invoices, outstanding)
// with the new cost estimate. Server-only — imports getSupabaseServer. The
// pure core `pnlFromRow` is exported too so the per-job P&L page can call it on
// the quote row it already loads (no second query).
//
// Revenue is DERIVED, never entered here:
// - contracted = calculation_data.clientQuoteTotalCents (the quote price).
// - invoiced   = sum of invoice amounts (computeInvoiceAmounts.totalInvoicedCents).
// - paid       = invoiced - outstandingCents (reuses lib/invoice-calculations).
// Cost comes from cost_estimate_data via lib/cost-estimate (saved estimate,
// or a default built from the quote's sqft when none is saved yet).

import { getSupabaseServer } from "@/lib/supabase-server";
import {
  computeCostEstimate,
  buildDefaultCostEstimate,
  normalizeCostEstimate,
  normalizeDefaults,
  type CostEstimateDefaults,
  type JobPnl
} from "@/lib/cost-estimate";
import {
  computeInvoiceAmounts,
  outstandingCents
} from "@/lib/invoice-calculations";
import type { InvoiceData, QuoteCalculationResult, QuoteFormState } from "@/lib/types";

// The columns the aggregate P&L report selects from the quotes table. All the
// JSONB blobs hold everything else; client_name/project_name live inside
// quote_data so we read them from there (single source of truth, and sqft is
// only in quote_data anyway).
export type QuotePnlRow = {
  id: string;
  quote_id: string;
  status: string;
  created_at: string;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult;
  invoice_data: InvoiceData | null;
  cost_estimate_data: unknown;
};

// Pure core: compute one JobPnl from a quote row + the global cost defaults.
// No Supabase, no async — the per-job P&L page calls this directly on the row
// it already loaded. The aggregate report maps every row through this.
export function pnlFromRow(
  row: QuotePnlRow,
  defaults: CostEstimateDefaults
): JobPnl {
  // quote_data is always present on a saved quote, but the aggregate report
  // scans every row, so guard against a null/malformed blob crashing the whole
  // report. A {} fallback yields undefined fields, which the ?? / || patterns
  // below handle safely.
  const quote = (row.quote_data ?? {}) as QuoteFormState;
  const jobName =
    (quote.projectName && quote.projectName.trim()) ||
    quote.clientName ||
    "Unnamed job";
  const clientName = quote.clientName || "";
  const sqft = Math.max(0, Number(quote.squareFootage) || 0);

  // Revenue.
  const contractedCents = Math.max(
    0,
    Math.round(row.calculation_data?.clientQuoteTotalCents ?? 0)
  );

  const invoiceData = row.invoice_data;
  const invoicedCents = invoiceData
    ? Math.max(0, computeInvoiceAmounts(invoiceData).totalInvoicedCents)
    : 0;
  const outstanding = invoiceData ? outstandingCents(invoiceData) : 0;
  const paidCents = Math.max(0, invoicedCents - outstanding);

  // Cost. A saved estimate is used as-is; otherwise build the default from
  // sqft so the number is still meaningful (the UI flags "no cost entered").
  const saved = row.cost_estimate_data;
  const hasCost = saved != null && typeof saved === "object";
  const data = hasCost
    ? normalizeCostEstimate(saved, defaults)
    : buildDefaultCostEstimate(sqft, defaults);
  const costCents = computeCostEstimate(data).totalJobCostCents;

  // Period key: earliest invoice issued date, else the quote date. Falls back
  // to created_at when neither is present so every job lands in some period.
  const invoiceDates =
    invoiceData?.invoices
      ?.map((inv) => inv.issuedAt ?? null)
      .filter((v): v is string => Boolean(v)) ?? [];
  const periodDate =
    invoiceDates.length > 0
      ? invoiceDates.sort()[0] ?? null
      : quote.quoteDate || row.created_at || null;

  return {
    quoteId: row.quote_id,
    jobId: row.id,
    jobName,
    clientName,
    periodDate,
    contractedCents,
    invoicedCents,
    paidCents,
    costCents,
    hasCost
  };
}

// Load every quote's P&L for the aggregate report. Includes all statuses —
// drafts show contracted (projected) margin only; accepted+invoiced jobs show
// invoiced/paid too. The client-side period filter narrows what is displayed.
// Capped so a runaway table never loads thousands of rows silently; the
// caller warns when the cap is hit.
const PNL_LIMIT = 500;

export async function getAllJobPnls(): Promise<{
  jobs: JobPnl[];
  defaults: CostEstimateDefaults;
  capped: boolean;
}> {
  const supabase = getSupabaseServer();

  // Defaults come from app_settings.cost_estimate_defaults (folded into
  // getSettings / getPricingCatalog). Fetch directly here to keep this module
  // self-contained for the report page.
  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("cost_estimate_defaults")
    .eq("id", 1)
    .single();
  const defaults = normalizeDefaults(
    (settingsRow as { cost_estimate_defaults?: unknown } | null)?.cost_estimate_defaults
  );

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, status, created_at, quote_data, calculation_data, invoice_data, cost_estimate_data"
    )
    .order("created_at", { ascending: false })
    .limit(PNL_LIMIT);

  if (error) {
    return { jobs: [], defaults, capped: false };
  }

  const rows = (data ?? []) as QuotePnlRow[];
  const jobs = rows.map((row) => pnlFromRow(row, defaults));
  const capped = rows.length >= PNL_LIMIT;

  return { jobs, defaults, capped };
}

export { PNL_LIMIT };