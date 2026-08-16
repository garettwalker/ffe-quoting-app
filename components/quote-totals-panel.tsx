import { formatCurrency, formatPercent } from "@/lib/currency";
import { getAdderPriceVariance } from "@/lib/calculations";
import type { QuoteCalculationResult } from "@/lib/types";

type QuoteTotalsPanelProps = {
  result: QuoteCalculationResult;
};

// A small scope tag next to a lever row so the owner can see at a glance
// whether that lever moves the Base Package, the adders, or both. The whole
// point of this panel is to make the math legible instead of burying every
// effect inside each line's final price.
function ScopeTag({ scope }: { scope: "sqft" | "adders" | "both" | "line" }) {
  const map = {
    sqft: "Base pkg only",
    adders: "Adders only",
    both: "Base + adders",
    line: "This line only"
  } as const;
  return (
    <span className="rounded-full bg-sage/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-deep-pine">
      {map[scope]}
    </span>
  );
}

export function QuoteTotalsPanel({ result }: QuoteTotalsPanelProps) {
  const varianceCents = getAdderPriceVariance(result);
  const showVariance = varianceCents !== 0;
  // Signed currency so the direction of the bump is obvious: +$3,055 vs -$200.
  const varianceValue =
    varianceCents >= 0
      ? `+${formatCurrency(varianceCents)}`
      : formatCurrency(varianceCents);
  // The one-line reconciliation with real numbers, so the panel reads as an
  // equation instead of a stack of unrelated figures. The variance term only
  // appears when there's an actual override gap; with no overrides the formula
  // collapses to "before x multiplier = final" (which is then exact).
  const reconciliation = `${formatCurrency(
    result.totalBeforeClientMultiplierCents
  )} × ${formatPercent(result.combinedClientMultiplier)}${
    showVariance ? ` + ${varianceValue}` : ""
  } = ${formatCurrency(result.clientQuoteTotalCents)}`;

  return (
    <aside className="rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-soft lg:sticky lg:top-28">
      <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
        Live Total
      </p>

      <p className="font-display text-4xl font-bold tracking-[-0.04em] text-moss">
        {formatCurrency(result.clientQuoteTotalCents)}
      </p>

      <div className="mt-6 space-y-3">
        <TotalRow
          label="Base rate used"
          value={`${formatCurrency(result.baseRateCents)}/sf`}
          sub={result.baseRateLabel}
          scope="sqft"
        />
        <TotalRow
          label="Base package"
          value={formatCurrency(result.basePackageBaseTotalCents)}
          sub="sq ft x base rate"
          scope="sqft"
        />
        <TotalRow
          label="Selected adders"
          value={formatCurrency(result.selectedAddersBaseTotalCents)}
          sub={
            result.overriddenAdderLineCount > 0
              ? `${result.overriddenAdderLineCount} custom-priced line${
                  result.overriddenAdderLineCount === 1 ? "" : "s"
                } (ignore multipliers)`
              : "catalog base prices"
          }
          scope="adders"
        />
        <TotalRow
          label="Before adjustments"
          value={formatCurrency(result.totalBeforeClientMultiplierCents)}
          sub="base pkg + adders, pre-multiplier"
        />
        <TotalRow
          label={`Pricing level: ${result.pricingLevelName}`}
          value={formatPercent(result.pricingLevelMultiplier)}
          scope="both"
        />
        <TotalRow
          label={`Contingency: ${result.contingencyName}`}
          value={formatPercent(result.contingencyMultiplier)}
          scope="both"
        />
        <TotalRow
          label="Combined multiplier"
          value={formatPercent(result.combinedClientMultiplier)}
          sub="level x contingency"
          scope="both"
        />
        {showVariance ? (
          <TotalRow
            label="Adder price variance (vs price list)"
            value={varianceValue}
            sub="custom-priced lines vs catalog base"
            scope="adders"
          />
        ) : null}
      </div>

      <div className="mt-6 rounded-soft bg-pine p-4 text-whitewarm">
        <div className="flex items-center justify-between gap-4">
          <span className="font-black">Final Quote</span>
          <span className="text-xl font-black">
            {formatCurrency(result.clientQuoteTotalCents)}
          </span>
        </div>
        <p className="mt-2 text-xs font-bold leading-5 text-whitewarm/70">
          {reconciliation}
        </p>
        {result.overriddenAdderLineCount > 0 ? (
          <p className="mt-2 text-xs font-bold leading-4 text-whitewarm/80">
            Includes {result.overriddenAdderLineCount} custom-priced adder
            line{result.overriddenAdderLineCount === 1 ? "" : "s"} added at their
            set price (multipliers skipped).
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function TotalRow({
  label,
  value,
  sub,
  scope
}: {
  label: string;
  value: string;
  sub?: string;
  scope?: "sqft" | "adders" | "both" | "line";
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-pine/10 pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <span className="block text-sm font-bold text-charcoal/65">{label}</span>
        {sub ? (
          <span className="block text-xs font-medium text-charcoal/45">
            {sub}
          </span>
        ) : null}
        {scope ? (
          <span className="mt-1 block">
            <ScopeTag scope={scope} />
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-right text-sm font-black text-deep-pine">
        {value}
      </span>
    </div>
  );
}