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

  const basePackageBaseTotalCents = safeSquareFootage * baseRate.cents;

  const selectedAdders = quote.lineItems
    .map((line) => {
      const item = items.find(
        (pricingItem) => pricingItem.id === line.pricingItemId
      );

      if (!item || item.category === "Base") {
        return null;
      }

      return calculateLineItem(item, line.quantity, combinedClientMultiplier);
    })
    .filter((line): line is CalculatedLineItem => Boolean(line));

  const selectedAddersBaseTotalCents = selectedAdders.reduce(
    (sum, line) => sum + line.baseLineTotalCents,
    0
  );

  const totalBeforeClientMultiplierCents =
    basePackageBaseTotalCents + selectedAddersBaseTotalCents;

  const clientQuoteTotalCents = Math.round(
    totalBeforeClientMultiplierCents * combinedClientMultiplier
  );

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
    notes: baseRate.label
  };

  return {
    baseRateCents: baseRate.cents,
    baseRateLabel: baseRate.label,
    basePackageBaseTotalCents,
    selectedAddersBaseTotalCents,
    totalBeforeClientMultiplierCents,
    pricingLevelMultiplier: pricingLevel.multiplier,
    contingencyMultiplier: contingency.multiplier,
    combinedClientMultiplier,
    clientQuoteTotalCents,
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

function getBaseRate(quote: QuoteFormState): {
  cents: number;
  label: string;
} {
  if (quote.basePricingMode === "manual") {
    return {
      cents: sanitizeMoneyCents(quote.manualBaseRateCents),
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
  combinedClientMultiplier: number
): CalculatedLineItem {
  const safeQuantity = sanitizeQuantity(quantity);
  const clientUnitPriceCents = Math.round(
    item.basePriceCents * combinedClientMultiplier
  );

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
    notes: "Add-on"
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
