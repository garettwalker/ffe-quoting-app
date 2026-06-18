import { formatCurrency, formatPercent } from "@/lib/currency";
import type { QuoteCalculationResult } from "@/lib/types";

type QuoteTotalsPanelProps = {
  result: QuoteCalculationResult;
};

export function QuoteTotalsPanel({ result }: QuoteTotalsPanelProps) {
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
          value={`${formatCurrency(result.baseRateCents)} / sq ft`}
        />
        <TotalRow label="Base rate logic" value={result.baseRateLabel} />
        <TotalRow
          label="Base package"
          value={formatCurrency(result.basePackageBaseTotalCents)}
        />
        <TotalRow
          label="Selected adders"
          value={formatCurrency(result.selectedAddersBaseTotalCents)}
        />
        <TotalRow
          label="Before adjustments"
          value={formatCurrency(result.totalBeforeClientMultiplierCents)}
        />
        <TotalRow
          label="Pricing level"
          value={formatPercent(result.pricingLevelMultiplier)}
        />
        <TotalRow
          label="Contingency"
          value={formatPercent(result.contingencyMultiplier)}
        />
        <TotalRow
          label="Combined multiplier"
          value={formatPercent(result.combinedClientMultiplier)}
        />
      </div>

      <div className="mt-6 rounded-soft bg-pine p-4 text-whitewarm">
        <div className="flex items-center justify-between gap-4">
          <span className="font-black">Final Quote</span>
          <span className="text-xl font-black">
            {formatCurrency(result.clientQuoteTotalCents)}
          </span>
        </div>
      </div>
    </aside>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-pine/10 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-bold text-charcoal/65">{label}</span>
      <span className="text-right text-sm font-black text-deep-pine">
        {value}
      </span>
    </div>
  );
}
