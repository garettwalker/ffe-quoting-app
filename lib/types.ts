export type UnitType = "per_sqft" | "per_unit" | "flat" | "per_hour";

export type BasePricingMode = "auto" | "builder" | "manual";

// Row-level quote lifecycle. Lives on the Supabase `quotes` row, not on QuoteFormState.
// "scheduled" is a service-call-only stage between accepted and paid (a manual
// "Mark scheduled" button writes it; new-build quotes never use it).
export type QuoteStatus = "draft" | "prepared" | "accepted" | "scheduled";

// Which kind of quote this is. New build = the full catalog-driven quoting tool
// (per-sqft base rate, pricing level, contingency, two-invoice rough-in/finish
// model). Service call = freeform manual line items, single invoice, simpler
// 4-stage lifecycle. Lives on the `quotes.quote_type` column (default 'new_build'
// so every existing quote stays a new build). Old invoice_data blobs that predate
// the field are treated as new_build.
export type QuoteType = "new_build" | "service_call";

// Coerce a raw `quotes.status` value (typed as unknown/string from Supabase)
// into the QuoteStatus union. Anything unexpected — including the legacy
// "completed" status — is treated as "prepared" so the owner still sees a
// sensible action set. The SQL migration moves completed rows to prepared
// before deploy; this is the runtime backstop for any straggler.
export function normalizeStatus(value: unknown): QuoteStatus {
  if (
    value === "draft" ||
    value === "prepared" ||
    value === "accepted" ||
    value === "scheduled"
  ) {
    return value;
  }
  return "prepared";
}

// Coerce a raw `quotes.quote_type` value into the QuoteType union. Anything
// unexpected (including null/undefined on old rows before the column existed)
// falls back to "new_build" so the existing flow is the default.
export function normalizeQuoteType(value: unknown): QuoteType {
  if (value === "new_build" || value === "service_call") {
    return value;
  }
  return "new_build";
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

// The simpler 4-stage lifecycle for service-call quotes (vs the 5-stage new-build
// LifecycleStage above). "quote" collapses draft+prepared; "scheduled" is a manual
// status advance; "paid" is derived from the single invoice being paid in full.
// Computed in lib/invoice-calculations.ts (serviceLifecycleStage).
export type ServiceLifecycleStage =
  | "quote"
  | "accepted"
  | "scheduled"
  | "paid";

// A re-usable customer record linked from quotes. The quote still keeps its own
// client_name / client_email snapshot; customer_id is the link to the shared
// record used for autofill and the repository view. A customer holds multiple
// emails as a JSONB array (a builder can be a husband/wife team where he gets
// the quote and she gets the invoice). The first email is the "primary" used to
// autofill a new quote's contact email; the billing recipient is chosen at send
// time (no per-email billing flag). Lives in the public.customers table.
export type CustomerEmail = { email: string; label?: string };

export type Customer = {
  id: string;
  name: string;
  emails: CustomerEmail[];
  phone: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

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
  quote_type: QuoteType | null;
  client_quote_total_cents: number;
  status: QuoteStatus;
  invoice_data: InvoiceData | null;
  created_at: string;
};

// Invoicing (built on top of accepted quotes). Stored as JSONB in the
// `invoice_data` column on the quotes row, null until the owner sets it up.
// "service" is the single invoice for a service-call quote (no rough-in/finish
// split, no permit). New builds use "initial" + "finish".
export type InvoiceKind = "initial" | "finish" | "service";
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
  // Dedicated sequential invoice number (INV-0001), assigned once at invoice
  // setup and never changed. Optional so invoice_data saved before this field
  // existed keeps loading; those fall back to the derived invoiceReference
  // (Q-...-R / -F) for display until the setup is next re-saved (lazy backfill).
  invoiceNumber?: string;
};

export type InvoiceData = {
  // Which quote type this invoice setup belongs to. Optional only for backward
  // compat with old blobs; service-call setups MUST set this to "service_call"
  // so the calc functions take the single-invoice path. Absent = new_build.
  quoteType?: QuoteType;
  // The agreed contract amount. Defaults to the accepted quote total. For a
  // service call this is the sum of serviceLines[].amountCents.
  contractAmountCents: number;
  // Rough-in and finish percentages of the contract. Default 50/50. Unused for
  // service calls (single invoice, no split).
  roughInPercent: number;
  finishPercent: number;
  // Permit fee shown as its own line on the initial invoice. Unused for
  // service calls.
  permitFeeCents: number;
  // ISO timestamp the setup was last saved.
  generatedAt: string;
  // New build: exactly two records, initial then finish. Service call: exactly
  // one record, kind "service".
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
  // Service-call freeform line items. Used only when quoteType === "service_call"
  // (a single invoice with no split/permit). Each line is a free-text
  // description, a quantity, and a row amount in cents (NO unit price — the
  // amount is entered directly so there is no rounding drift). The contract
  // amount is the SUM of amountCents across these lines. Seeded from the quote's
  // serviceLines when invoicing is first set up, then lives on the invoice and is
  // edited independently of the quote (mirrors the new-build scopeLines pattern).
  // Optional so new-build invoice_data (which never has this field) still loads.
  serviceLines?: Array<{
    id: string;
    name: string;
    quantity: number;
    amountCents: number;
    comment?: string;
  }>;
};

// Field-stage progress for the Project Status Tracker, stored as JSONB on the
// `quotes` row (`project_status`). Only the 4 MANUAL field-stage dates are
// stored here; the other 4 tracker stages (Quote, Rough-in Billed, Final
// Billed, Paid) are DERIVED from quote/invoice/email-log facts in
// lib/projects.ts so the tracker can never disagree with /quotes or
// /receivables. Each date is ISO YYYY-MM-DD (date-only) or null = not done.
// A null column or all-null fields = no field progress yet (Quote stage).
export type ProjectStatus = {
  roughIn: string | null;
  roughInInspection: string | null;
  finish: string | null;
  finalInspection: string | null;
};

// One invoice flattened for the Accounts Receivable view. `outstandingCents`
// is the invoice amount when still unpaid, 0 once paid (per-invoice balance).
// `receivable` is true when the invoice counts toward the AR totals: paid, or
// the rough-in (always, billed at setup), or the finish once it has been emailed
// (a not-yet-emailed finish is "scheduled" — shown but not counted as owed).
// `receivableAt` is the date it became receivable (first sent email date, else
// paidAt, else issuedAt) and drives the "Invoiced" date column + oldest-first
// sort.
export type ReceivableInvoice = {
  kind: InvoiceKind;
  reference: string;
  amountCents: number;
  status: InvoiceStatus;
  outstandingCents: number;
  receivable: boolean;
  receivableAt: string | null;
  issuedAt: string | null;
  paidAt: string | null;
};

// One job (quote) flattened for the Accounts Receivable view: the two invoices
// plus job-level totals. `earliestReceivableAt` is the min receivable date
// across the job's receivable invoices and is the sort key for "oldest first".
// `scheduledCents` is the amount of any invoice that is set up but not yet
// receivable (not emailed / not paid) — for a new build that's the finish, for a
// service call that's the single invoice. Shown as "Scheduled / not yet billed"
// and keeps the job out of Historical Paid. The AR page partitions jobs into
// Pending Payments (receivable invoiced money and not paid in full) and
// Historical Paid (isPaidInFull) directly off these totals — matching
// lib/invoice-calculations. For a service call, `finish` is null and the single
// invoice lives in `initial` (the table renders one "Service" cell).
export type ReceivableJob = {
  id: string;
  quoteId: string;
  quoteType: QuoteType;
  clientName: string;
  projectName: string;
  projectType: string;
  initial: ReceivableInvoice | null;
  finish: ReceivableInvoice | null;
  totalInvoicedCents: number;
  totalPaidCents: number;
  totalOutstandingCents: number;
  scheduledCents: number;
  earliestReceivableAt: string | null;
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

// A freeform manual line on a service-call quote. No catalog item, no pricing
// levers — just a description, a quantity, and a row amount in cents (the
// amount is entered directly, so there is no unit price and no rounding drift).
// Optional customer-facing comment. Stored in quote_data.serviceLines (JSONB).
// The quote total is the SUM of amountCents across these lines.
export type ServiceLine = {
  id: string;
  name: string;
  quantity: number;
  amountCents: number;
  comment?: string;
};

export type QuoteFormState = {
  quoteId: string;
  quoteDate: string;
  // Which quote type this is. Defaults to "new_build" (old quotes predate the
  // field and resolve as new builds). For "service_call", the pricing levers
  // below (baseRate/pricingLevel/contingency/squareFootage/lineItems) are unused
  // and `serviceLines` carries the freeform line items instead.
  quoteType: QuoteType;
  clientName: string;
  clientEmail: string;
  // The paying party's phone number. A point-in-time snapshot like clientName
  // / clientEmail — autofilled from the linked customer's `phone` when one is
  // picked, editable on the form. Optional: old quotes predate the field and
  // leave it blank (every surface renders it only when present, like email).
  clientPhone?: string;
  // The linked customer record id (public.customers.id). The quote keeps its
  // own client_name / client_email snapshot; this is just the link used for
  // autofill and the repository view. Optional: backfilled quotes carry it on
  // the quotes.customer_id column but not in this JSONB snapshot until they
  // are re-saved; a quote with no customer record leaves it undefined.
  customerId?: string;
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
  // Service-call freeform line items. Used only when quoteType === "service_call"
  // (the pricing levers above are unused for service calls). Empty/ignored for
  // new builds. Old quotes predate the field and resolve to empty.
  serviceLines: ServiceLine[];
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
  // The cents gap between "(before-adjustments x combined multiplier)" and the
  // final quote — i.e. the net effect of per-line unit-price overrides, which
  // skip the multiplier and are priced absolutely. Surfaced as its own row in
  // the internal math breakdown so the totals reconcile visibly. Zero when no
  // adder lines are custom-priced. Quotes saved before this field existed are
  // reconciled on the fly via getAdderPriceVariance (lib/calculations.ts).
  adderPriceVarianceCents: number;
  // How many adder lines have a per-customer unit-price override (those lines
  // bypass the pricing-level/contingency multiplier). Surfaced in the internal
  // math breakdown so the scope of each lever is explicit.
  overriddenAdderLineCount: number;
  clientFacingLines: CalculatedLineItem[];
};

// The calculation snapshot for a service-call quote. Much simpler than the
// new-build QuoteCalculationResult: the total is just the sum of the freeform
// line amounts (no base package, no multipliers, no variance). Stored as
// `calculation_data` JSONB on the quotes row for service-call quotes; the
// service quote PDF/preview reads serviceLines off quote_data directly.
export type ServiceQuoteCalculationResult = {
  clientQuoteTotalCents: number;
  lines: ServiceLine[];
};
