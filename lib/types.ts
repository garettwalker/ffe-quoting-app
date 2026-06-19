export type UnitType = "per_sqft" | "per_unit" | "flat" | "per_hour";

export type BasePricingMode = "auto" | "builder" | "manual";

// Row-level quote lifecycle. Lives on the Supabase `quotes` row, not on QuoteFormState.
export type QuoteStatus = "draft" | "prepared" | "accepted";

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
// into Pending Payments (totalOutstandingCents > 0) and Historical Paid (fully
// paid with a real invoiced amount).
export type ReceivableJob = {
  id: string;
  quoteId: string;
  clientName: string;
  projectType: string;
  initial: ReceivableInvoice | null;
  finish: ReceivableInvoice | null;
  totalInvoicedCents: number;
  totalPaidCents: number;
  totalOutstandingCents: number;
  earliestIssuedAt: string | null;
  isFullyPaid: boolean;
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
// text shown on printable quotes and invoices. Lives in the app_settings table.
export type AppSettings = {
  businessName: string;
  businessEmail: string;
  businessTagline: string;
  defaultQuoteNotes: string;
  invoicePaymentTerms: string;
};

// The full live-pricing catalog, fetched server-side from Supabase and passed
// into the builder. List arrays include inactive rows so the builder can still
// resolve and display values referenced by an edited quote.
export type PricingCatalog = {
  items: PricingItem[];
  levels: PricingLevel[];
  contingencies: ContingencyOption[];
  projectTypes: ProjectType[];
  settings: AppSettings;
};

export type QuoteLineInput = {
  pricingItemId: string;
  quantity: number;
};

export type QuoteFormState = {
  quoteId: string;
  quoteDate: string;
  clientName: string;
  clientEmail: string;
  projectStreet: string;
  projectCity: string;
  projectState: string;
  projectZip: string;
  projectType: string;
  squareFootage: number;
  basePricingMode: BasePricingMode;
  manualBaseRateCents: number;
  highCeilingOrComplexSwitching: boolean;
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
};

export type QuoteCalculationResult = {
  baseRateCents: number;
  baseRateLabel: string;
  basePackageBaseTotalCents: number;
  selectedAddersBaseTotalCents: number;
  totalBeforeClientMultiplierCents: number;
  pricingLevelMultiplier: number;
  contingencyMultiplier: number;
  combinedClientMultiplier: number;
  clientQuoteTotalCents: number;
  clientFacingLines: CalculatedLineItem[];
};
