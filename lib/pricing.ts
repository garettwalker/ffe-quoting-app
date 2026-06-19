import { supabase } from "@/lib/supabase";
import type {
  AppSettings,
  ContingencyOption,
  PricingCatalog,
  PricingItem,
  PricingLevel,
  ProjectType
} from "@/lib/types";

// Server-side readers for the live pricing catalog and app settings, stored in
// Supabase (see the README "Pricing admin" SQL). The shared supabase client is
// configured with cache: "no-store" so server components always read fresh rows.
// All list queries return active AND inactive rows (active-filtering happens in
// the UI) so an edited quote that references a now-inactive item/level still
// resolves and displays. Numeric multipliers come back from PostgREST as
// strings, so they are coerced with Number().

// Read the single app_settings row (id = 1). Returns empty-string fields if the
// row is missing (e.g. the migration has not been run yet) so print pages degrade
// gracefully instead of crashing.
export async function getSettings(): Promise<AppSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select(
      "business_name, business_email, business_tagline, default_quote_notes, invoice_payment_terms"
    )
    .eq("id", 1)
    .single();

  const row = (data ?? {}) as Partial<{
    business_name: string;
    business_email: string;
    business_tagline: string;
    default_quote_notes: string;
    invoice_payment_terms: string;
  }>;

  return {
    businessName: row.business_name ?? "",
    businessEmail: row.business_email ?? "",
    businessTagline: row.business_tagline ?? "",
    defaultQuoteNotes: row.default_quote_notes ?? "",
    invoicePaymentTerms: row.invoice_payment_terms ?? ""
  };
}

// Read the full live-pricing catalog (all rows including inactive, ordered by
// sort_order) plus the app settings. Used by the builder entry points.
export async function getPricingCatalog(): Promise<PricingCatalog> {
  const [itemsRes, levelsRes, contingenciesRes, projectTypesRes, settings] =
    await Promise.all([
      supabase
        .from("pricing_items")
        .select(
          "id, category, name, unit_type, base_price_cents, active, sort_order"
        )
        .order("sort_order", { ascending: true }),
      supabase
        .from("pricing_levels")
        .select("id, name, multiplier, description, active, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("contingency_options")
        .select("id, name, multiplier, active, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("project_types")
        .select("id, name, active, sort_order")
        .order("sort_order", { ascending: true }),
      getSettings()
    ]);

  const items = (itemsRes.data ?? []).map(toPricingItem);
  const levels = (levelsRes.data ?? []).map(toPricingLevel);
  const contingencies = (contingenciesRes.data ?? []).map(toContingencyOption);
  const projectTypes = (projectTypesRes.data ?? []).map(toProjectType);

  return { items, levels, contingencies, projectTypes, settings };
}

type PricingItemRow = {
  id: string;
  category: string;
  name: string;
  unit_type: string;
  base_price_cents: number;
  active: boolean;
  sort_order: number;
};

function toPricingItem(row: PricingItemRow): PricingItem {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    unitType: row.unit_type as PricingItem["unitType"],
    basePriceCents: row.base_price_cents ?? 0,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0
  };
}

type PricingLevelRow = {
  id: string;
  name: string;
  multiplier: string | number;
  description: string;
  active: boolean;
  sort_order: number;
};

function toPricingLevel(row: PricingLevelRow): PricingLevel {
  return {
    id: row.id,
    name: row.name,
    multiplier: Number(row.multiplier) || 1,
    description: row.description ?? "",
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0
  };
}

type ContingencyRow = {
  id: string;
  name: string;
  multiplier: string | number;
  active: boolean;
  sort_order: number;
};

function toContingencyOption(row: ContingencyRow): ContingencyOption {
  return {
    id: row.id,
    name: row.name,
    multiplier: Number(row.multiplier) || 1,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0
  };
}

type ProjectTypeRow = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
};

function toProjectType(row: ProjectTypeRow): ProjectType {
  return {
    id: row.id,
    name: row.name,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0
  };
}