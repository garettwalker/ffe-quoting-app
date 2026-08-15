export type UnitType = "per_sqft" | "per_unit" | "flat" | "per_hour";

export type BasePricingMode = "auto" | "builder" | "manual";

// Row-level quote lifecycle. Lives on the Supabase `quotes` row, not on QuoteFormState.
export type QuoteStatus = "draft" | "prepared" | "accepted";

// Coerce a raw `quotes.status` value (typed as unknown/string from Supabase)
// into the QuoteStatus union. Anything unexpected — including the legacy
// "completed" status — is treated as "prepared" so the owner still sees a
// sensible action set. The SQL migration moves completed rows to prepared
// before deploy; this is the runtime backstop for any straggler.
export function normalizeStatus(value: unknown): QuoteStatus {
  if (value === "draft" || value === "prepared" || value === "accepted") {
    return value;
  }
  return "prepared";
}

// The full customer lifecycle shown on the dashboard. The first three come
// straight from the row status. The last two are derived for accepted quotes
// from the invoice setup (no invoices yet = accepted, invoices with money
// outstanding = pending_payment, all invoices paid = paid_in_full). Nothing
// extra is stored on the row; these two are computed on the fly.
export type LifecycleStage =
  | "draft"
  | "prepared"
  | "accepted"
  | "pending_payment"
  | "paid_in_full";

// The columns the dashboard selects from the quotes table.
export type DashboardQuoteRow = {
  id: string;
  quote_id: string;
  quote_date: string;
  client_name: string;
  project_name: string | null;
  project_street: string;
  project_city: string;
  project_state: string;
  project_zip: string;
  project_type: string;
  client_quote_total_cents: number;
  status: QuoteStatus;
  invoice_data: InvoiceData | null;
  created_at: string;
};

// Invoicing (built on top of accepted quotes). Stored as JSONB in the
// `invoice_data` column on the quotes row, null until the owner sets it up.
export type InvoiceKind = "initial" | "finish";
export type InvoiceStatus = "unpaid" | "paid";

export type InvoiceRecord = {
  kind: InvoiceKind;
  // initial = roughInAmount + permitFee; finish = finish amount.
  amountCents: number;
  status: InvoiceStatus;
  // ISO timestamp of when the invoice was first issued/printed, if ever.
  issuedAt: string | null;
  // ISO timestamp of when it was marked paid, if ever.
  paidAt: string | null;
};

export type InvoiceData = {
  // The agreed contract amount. Defaults to the accepted quote total.
  contractAmountCents: number;
  // Rough-in and finish percentages of the contract. Default 50/50.
  roughInPercent: number;
  finishPercent: number;
  // Permit fee shown as its own line on the initial invoice.
  permitFeeCents: number;
  // ISO timestamp the setup was last saved.
  generatedAt: string;
  // Exactly two records: initial then finish.
  invoices: InvoiceRecord[];
  // Scope-of-work line items shown on both invoices. Each line is a real
  // priced item: a catalog pricing item (or the base-package pseudo-item),
  // a quantity, an editable unit price, and a customer-facing comment. The
  // contract amount is the SUM of (quantity * unitPriceCents) across these
  // lines; the rough-in/finish percentages then split that contract into the
  // two invoices (same % model as before — the lines just become the source
  // of the contract instead of a hand-entered dollar amount). Seeded from the
  // quote's line items (names + quantities + client prices + comments) when
  // invoicing is first set up, then lives on the invoice and is edited
  // independently of the quote. Optional so invoices set up before this field
  // existed still load: those keep their hand-entered contractAmountCents
  // (no lines) and the PDF/print path backfills a display-only scope from the
  // quote's calculation_data.clientFacingLines when absent.
  scopeLines?: Array<{
    // Catalog PricingItem id, or the base-package pseudo-id
    // "base-electrical-package". Empty string for a legacy/manual line.
    pricingItemId: string;
    // Name snapshot for display (PDF/print do not have the catalog).
    name: string;
    // Unit type snapshot (per_sqft / per_unit / flat / per_hour) shown in the
    // line-items table like the quote's "Unit" column.
    unitType: string;
    quantity: number;
    unitPriceCents: number;
    comment: string;
  }>;
};

// One invoice flattened for the Accounts Receivable view. `outstandingCents`
// is the invoice amount when still unpaid, 0 once paid (per-invoice balance).
export type ReceivableInvoice = {
  kind: InvoiceKind;
  reference: string;
  amountCents: number;
  status: InvoiceStatus;
  outstandingCents: number;
  issuedAt: string | null;
  paidAt: string | null;
};

// One job (quote) flattened for the Accounts Receivable view: the two invoices
// plus job-level totals. `earliestIssuedAt` is the min issuedAt across the job's
// invoices and is the sort key for "oldest first". The AR page partitions jobs
// into Pending Payments (totalOutstandingCents > 0) and Historical Paid
// (totalOutstandingCents === 0 with a real invoiced amount) directly off these
// totals — matching lib/invoice-calculations `isPaidInFull`.
export type ReceivableJob = {
  id: string;
  quoteId: string;
  clientName: string;
  projectName: string;
  projectType: string;
  initial: ReceivableInvoice | null;
  finish: ReceivableInvoice | null;
  totalInvoicedCents: number;
  totalPaidCents: number;
  totalOutstandingCents: number;
  earliestIssuedAt: string | null;
};

export type PricingItem = {
  id: string;
  category: string;
  name: string;
  unitType: UnitType;
  basePriceCents: number;
  active: boolean;
  sortOrder: number;
};

export type PricingLevel = {
  id: string;
  name: string;
  multiplier: number;
  description: string;
  active: boolean;
  sortOrder: number;
};

export type ContingencyOption = {
  id: string;
  name: string;
  multiplier: number;
  active: boolean;
  sortOrder: number;
};

// A selectable project-type row. Quotes store the display `name` (not the id)
// in quote_data.projectType, for backward compatibility with existing saved
// quotes, so the builder dropdown emits the name.
export type ProjectType = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

// The single app_settings row: business identity + customer-facing boilerplate
// text shown on printable quotes and invoices, plus the internal cost-estimate
// defaults (default material bucket names + labor rate) edited in Pricing Admin.
// Lives in the app_settings table. costEstimateDefaults is null when the column
// is empty / not yet saved; callers fall back to the built-in defaults in
// lib/cost-estimate.
import type { CostEstimateDefaults } from "@/lib/cost-estimate";

export type AppSettings = {
  businessName: string;
  businessEmail: string;
  businessTagline: string;
  defaultQuoteNotes: string;
  invoicePaymentTerms: string;
  costEstimateDefaults: CostEstimateDefaults | null;
};

// The full live-pricing catalog, fetched server-side from Supabase and passed
// into the builder. List arrays include inactive rows so the builder can still
// resolve and display values referenced by an edited quote.
export type PricingCatalog = {
  items: PricingItem[];
  levels: PricingLevel[];
  contingencies: ContingencyOption[];
  projectTypes: ProjectType[];
  baseRates: BaseRate[];
  settings: AppSettings;
};

// A named per-square-foot base-rate preset the owner picks from in the builder
// (e.g. "Standard - $6.00", "Big complex / all-in - $8.00"). Admin-editable in
// Pricing Admin (see components/base-rate-editor.tsx). The quote stores the
// chosen rate cents directly (a snapshot), so editing a preset later does not
// move already-saved quotes.
export type BaseRate = {
  id: string;
  name: string;
  rateCents: number;
  active: boolean;
  sortOrder: number;
};

export type QuoteLineInput = {
  pricingItemId: string;
  quantity: number;
  // Optional customer-facing comment on this adder line, shown on the
  // Detailed Quote (preview + PDF) under the item name. Empty/undefined
  // means no comment. Stored inside quote_data.lineItems (JSONB), so no
  // schema migration is needed; old saved quotes simply have no comment.
  comment?: string;
  // Optional per-line unit-price override in cents. When unset, the line's
  // customer-facing unit price is derived from the catalog base price x the
  // quote's pricing-level/contingency multiplier (the default). When set, this
  // is the absolute per-unit price the customer pays for this line and the
  // multiplier no longer applies to it. Lets Chad edit prices per customer
  // (the catalog + pricing level are just the starting point). Stored in
  // quote_data.lineItems (JSONB); old saved quotes have no field and keep the
  // derived price. See lib/calculations.ts (calculateLineItem override branch).
  unitPriceCents?: number;
};

export type QuoteFormState = {
  quoteId: string;
  quoteDate: string;
  clientName: string;
  clientEmail: string;
  // The residence / site name (e.g. "Fulk Residence") — the job identity shown
  // as the job name on the dashboard, pipeline, receivables, and schedule.
  // The clientName/clientEmail fields below it are the paying party, labeled
  // "Builder / Customer" in the UI (a builder/GC OR a direct homeowner).
  // Optional: old quotes predate the field and leave it blank (display falls
  // back to clientName); spec homes / unfilled jobs leave it blank too.
  projectName?: string;
  projectStreet: string;
  projectCity: string;
  projectState: string;
  projectZip: string;
  projectType: string;
  squareFootage: number;
  // The primary price lever: the per-square-foot rate for the Base Package.
  // The owner picks a named preset (baseRateId) or enters a custom rate; the
  // effective rate is stored directly as a snapshot (baseRateCents +
  // baseRateLabel). This replaces the old base-pricing-mode + high-ceiling
  // auto logic. The three legacy fields below are kept ONLY so saved quotes
  // from before this change still load; they are optional and no longer edited
  // in the builder. See lib/calculations.ts (getBaseRate legacy fallback).
  baseRateCents?: number;
  baseRateLabel?: string;
  baseRateId?: string | null;
  basePricingMode?: BasePricingMode;
  manualBaseRateCents?: number;
  highCeilingOrComplexSwitching?: boolean;
  pricingLevelId: string;
  contingencyId: string;
  internalNotes: string;
  lineItems: QuoteLineInput[];
};

export type CalculatedLineItem = {
  pricingItemId: string;
  category: string;
  name: string;
  unitType: UnitType;
  quantity: number;
  baseUnitPriceCents: number;
  baseLineTotalCents: number;
  clientUnitPriceCents: number;
  clientLineTotalCents: number;
  notes: string;
  // Customer-facing comment carried through from the adder line input.
  // Shown on the Detailed Quote under the item name. Empty string when none.
  comment: string;
};

export type QuoteCalculationResult = {
  baseRateCents: number;
  baseRateLabel: string;
  basePackageBaseTotalCents: number;
  selectedAddersBaseTotalCents: number;
  totalBeforeClientMultiplierCents: number;
  pricingLevelMultiplier: number;
  pricingLevelName: string;
  contingencyMultiplier: number;
  contingencyName: string;
  combinedClientMultiplier: number;
  clientQuoteTotalCents: number;
  // How many adder lines have a per-customer unit-price override (those lines
  // bypass the pricing-level/contingency multiplier). Surfaced in the internal
  // math breakdown so the scope of each lever is explicit.
  overriddenAdderLineCount: number;
  clientFacingLines: CalculatedLineItem[];
};
