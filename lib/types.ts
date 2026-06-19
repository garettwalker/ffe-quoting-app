export type UnitType = "per_sqft" | "per_unit" | "flat" | "per_hour";

export type BasePricingMode = "auto" | "builder" | "manual";

// Row-level quote lifecycle. Lives on the Supabase `quotes` row, not on QuoteFormState.
export type QuoteStatus = "draft" | "prepared" | "accepted";

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
  created_at: string;
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
};

export type ContingencyOption = {
  id: string;
  name: string;
  multiplier: number;
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
