import type {
  CalculatedLineItem,
  ContingencyOption,
  PricingItem,
  PricingLevel,
  QuoteCalculationResult,
  QuoteFormState
} from "@/lib/types";

const BUILDER_SPEC_RATE_CENTS = 500;
const SMALL_HOME_RATE_CENTS = 700;
const HIGH_COMPLEXITY_RATE_CENTS = 650;
const DEFAULT_RATE_CENTS = 600;

// Fallbacks used when a quote references a pricing level or contingency that no
// longer exists (or the catalog is empty). Both default to a 1.0 multiplier so a
// missing/renamed row never silently zeroes out a quote. Previously these fell
// back to a fixed array index, which broke if rows were reordered or
// deactivated; looking up by stable id is safe against that.
const DEFAULT_PRICING_LEVEL: PricingLevel = {
  id: "standard-custom",
  name: "Standard/Custom",
  multiplier: 1,
  description: "",
  active: true,
  sortOrder: 0
};

const DEFAULT_CONTINGENCY: ContingencyOption = {
  id: "contingency-0",
  name: "0%",
  multiplier: 1,
  active: true,
  sortOrder: 0
};

export function calculateQuote(
  quote: QuoteFormState,
  items: PricingItem[],
  levels: PricingLevel[],
  contingencies: ContingencyOption[]
): QuoteCalculationResult {
  const pricingLevel =
    levels.find((level) => level.id === quote.pricingLevelId) ??
    levels.find((level) => level.id === DEFAULT_PRICING_LEVEL.id) ??
    levels[0] ??
    DEFAULT_PRICING_LEVEL;

  const contingency =
    contingencies.find((option) => option.id === quote.contingencyId) ??
    contingencies.find((option) => option.id === DEFAULT_CONTINGENCY.id) ??
    contingencies[0] ??
    DEFAULT_CONTINGENCY;

  const baseRate = getBaseRate(quote);
  const combinedClientMultiplier =
    pricingLevel.multiplier * contingency.multiplier;

  const safeSquareFootage = sanitizeQuantity(quote.squareFootage);

  // Count adder lines the owner has given a per-customer price override, so
  // the internal math breakdown can state their scope explicitly (they bypass
  // the pricing-level/contingency multiplier).
  const overriddenAdderLineCount = quote.lineItems.filter(
    (line) =>
      typeof line.unitPriceCents === "number" &&
      Number.isFinite(line.unitPriceCents)
  ).length;

  const basePackageBaseTotalCents = safeSquareFootage * baseRate.cents;

  // Adder lines whose unit price the owner has overridden snap to that
  // absolute client price (the pricing-level/contingency multiplier no longer
  // applies to them); the rest stay derived from catalog base x multiplier.
  // The grand total must therefore split: derived lines roll up under the one
  // multiplier pass (preserving the original rounding exactly for quotes with
  // no overrides), and overridden lines add their absolute line totals on top.
  let overriddenAddersClientTotalCents = 0;
  let derivedAddersBaseTotalCents = 0;

  const selectedAdders = quote.lineItems
    .map((line) => {
      const item = items.find(
        (pricingItem) => pricingItem.id === line.pricingItemId
      );

      if (!item || item.category === "Base") {
        return null;
      }

      const calc = calculateLineItem(
        item,
        line.quantity,
        combinedClientMultiplier,
        line.comment,
        line.unitPriceCents
      );

      if (
        typeof line.unitPriceCents === "number" &&
        Number.isFinite(line.unitPriceCents)
      ) {
        overriddenAddersClientTotalCents += calc.clientLineTotalCents;
      } else {
        derivedAddersBaseTotalCents += calc.baseLineTotalCents;
      }

      return calc;
    })
    .filter((line): line is CalculatedLineItem => Boolean(line));

  const selectedAddersBaseTotalCents = selectedAdders.reduce(
    (sum, line) => sum + line.baseLineTotalCents,
    0
  );

  const totalBeforeClientMultiplierCents =
    basePackageBaseTotalCents + selectedAddersBaseTotalCents;

  const clientQuoteTotalCents =
    Math.round(
      (basePackageBaseTotalCents + derivedAddersBaseTotalCents) *
        combinedClientMultiplier
    ) + overriddenAddersClientTotalCents;

  const baseClientUnitPriceCents = Math.round(
    baseRate.cents * combinedClientMultiplier
  );

  const baseLine: CalculatedLineItem = {
    pricingItemId: "base-electrical-package",
    category: "Base",
    name: "Base Electrical Package",
    unitType: "per_sqft",
    quantity: safeSquareFootage,
    baseUnitPriceCents: baseRate.cents,
    baseLineTotalCents: basePackageBaseTotalCents,
    clientUnitPriceCents: baseClientUnitPriceCents,
    clientLineTotalCents: safeSquareFootage * baseClientUnitPriceCents,
    notes: baseRate.label,
    comment: ""
  };

  return {
    baseRateCents: baseRate.cents,
    baseRateLabel: baseRate.label,
    basePackageBaseTotalCents,
    selectedAddersBaseTotalCents,
    totalBeforeClientMultiplierCents,
    pricingLevelMultiplier: pricingLevel.multiplier,
    pricingLevelName: pricingLevel.name,
    contingencyMultiplier: contingency.multiplier,
    contingencyName: contingency.name,
    combinedClientMultiplier,
    clientQuoteTotalCents,
    overriddenAdderLineCount,
    clientFacingLines: [baseLine, ...selectedAdders]
  };
}

// Group the client-facing lines by category and sum each category's
// client-facing total (post pricing-level/contingency multiplier), preserving
// first-appearance order. The Base line (category "Base") is always first.
// Categories that total zero are dropped so the summary stays clean. Used by
// the printable Summary Quote.
export function summarizeByCategory(result: QuoteCalculationResult) {
  const order: string[] = [];
  const totals = new Map<string, number>();
  for (const line of result.clientFacingLines) {
    const prev = totals.get(line.category) ?? 0;
    totals.set(line.category, prev + line.clientLineTotalCents);
    if (!order.includes(line.category)) order.push(line.category);
  }
  return order
    .map((category) => ({ category, totalCents: totals.get(category) ?? 0 }))
    .filter((entry) => entry.totalCents > 0);
}

// Friendly display name for a category on the customer-facing Summary Quote.
// "Base" reads better as "Base Package"; every other category uses its raw
// name. Shared by the on-screen Summary page and the Summary PDF helper so the
// preview and the downloaded PDF can never disagree.
export function categoryDisplayName(category: string): string {
  if (category === "Base") return "Base Package";
  return category;
}

// Resolve the per-square-foot base rate for a quote. The primary source is the
// owner's chosen rate stored directly on the quote (baseRateCents + a label),
// which is a point-in-time snapshot. Quotes saved before that field existed
// fall back to the legacy auto logic (base-pricing mode + high-ceiling toggle
// + square footage) so they keep rendering at the rate they were built with
// until they are re-saved in the new builder.
function getBaseRate(quote: QuoteFormState): {
  cents: number;
  label: string;
} {
  if (
    typeof quote.baseRateCents === "number" &&
    Number.isFinite(quote.baseRateCents) &&
    quote.baseRateCents > 0
  ) {
    return {
      cents: Math.round(quote.baseRateCents),
      label: quote.baseRateLabel?.trim() || "Selected base rate"
    };
  }

  return deriveLegacyBaseRate(quote);
}

// Legacy base-rate derivation, kept only so pre-base-rate-preset quotes still
// load. New quotes never use this: the builder stores the chosen rate directly.
// Exported so the builder can pre-fill the new base-rate dropdown when opening
// a quote saved under the old model.
export function deriveLegacyBaseRate(quote: QuoteFormState): {
  cents: number;
  label: string;
} {
  if (quote.basePricingMode === "manual") {
    return {
      cents: sanitizeMoneyCents(quote.manualBaseRateCents ?? 0),
      label: "Manual base rate"
    };
  }

  if (quote.basePricingMode === "builder") {
    return {
      cents: BUILDER_SPEC_RATE_CENTS,
      label: "Builder/spec base rate"
    };
  }

  if (quote.squareFootage > 0 && quote.squareFootage < 2500) {
    return {
      cents: SMALL_HOME_RATE_CENTS,
      label: "Small home under 2,500 sq ft"
    };
  }

  if (quote.highCeilingOrComplexSwitching) {
    return {
      cents: HIGH_COMPLEXITY_RATE_CENTS,
      label: "High ceiling / complex switching"
    };
  }

  return {
    cents: DEFAULT_RATE_CENTS,
    label: "Auto base logic"
  };
}

function calculateLineItem(
  item: PricingItem,
  quantity: number,
  combinedClientMultiplier: number,
  comment?: string,
  unitPriceCentsOverride?: number
): CalculatedLineItem {
  const safeQuantity = sanitizeQuantity(quantity);
  const overridden =
    typeof unitPriceCentsOverride === "number" &&
    Number.isFinite(unitPriceCentsOverride);
  // An override is the absolute per-unit price the customer pays; the
  // pricing-level/contingency multiplier is bypassed for that line. Without
  // one, the client unit price is catalog base x the combined multiplier.
  const clientUnitPriceCents = overridden
    ? Math.round(unitPriceCentsOverride as number)
    : Math.round(item.basePriceCents * combinedClientMultiplier);

  return {
    pricingItemId: item.id,
    category: item.category,
    name: item.name,
    unitType: item.unitType,
    quantity: safeQuantity,
    baseUnitPriceCents: item.basePriceCents,
    baseLineTotalCents: item.basePriceCents * safeQuantity,
    clientUnitPriceCents,
    clientLineTotalCents: clientUnitPriceCents * safeQuantity,
    notes: "Add-on",
    comment: (comment ?? "").trim()
  };
}

function sanitizeQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value);
}

function sanitizeMoneyCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value);
}
