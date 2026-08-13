"use client";

import { useRef } from "react";

import type { PricingItem, QuoteLineInput } from "@/lib/types";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { CatalogPicker } from "@/components/catalog-picker";
import { FormattedNumberInput } from "@/components/formatted-number-input";

type QuoteLineItemPickerProps = {
  // The full pricing-items catalog (active + inactive), fetched from Supabase
  // and passed down from the builder. The "available to add" list filters to
  // active non-Base items; already-selected lines resolve from the full list so
  // an inactive selected item still displays.
  items: PricingItem[];
  lineItems: QuoteLineInput[];
  // Combined pricing-level x contingency multiplier, so a line with no
  // per-customer price override can show its derived client unit price
  // (catalog base x multiplier) as the editable field's default.
  clientMultiplier: number;
  onAddLineItem: (pricingItemId: string) => void;
  onUpdateQuantity: (pricingItemId: string, quantity: number) => void;
  onUpdateUnitPrice: (pricingItemId: string, unitPriceCents: number) => void;
  onUpdateComment: (pricingItemId: string, comment: string) => void;
  onRemoveLineItem: (pricingItemId: string) => void;
};

export function QuoteLineItemPicker({
  items,
  lineItems,
  clientMultiplier,
  onAddLineItem,
  onUpdateQuantity,
  onUpdateUnitPrice,
  onUpdateComment,
  onRemoveLineItem
}: QuoteLineItemPickerProps) {
  const activeAdders = items.filter(
    (item) => item.active && item.category !== "Base"
  );

  const availableItems = activeAdders.filter(
    (item) =>
      !lineItems.some((lineItem) => lineItem.pricingItemId === item.id)
  );

  // Per-line dollars value captured when the Unit Price field gains focus, so
  // the on-blur price-change confirmation only fires on a real edit (not when
  // the derived price shifted because the pricing level changed).
  const priceAtFocus = useRef<Record<string, number>>({});

  // The effective per-unit price (cents) for a line: the owner's override when
  // set, otherwise the derived catalog base x the job's multiplier.
  function effectiveUnitPriceCents(
    line: QuoteLineInput,
    item: PricingItem
  ): number {
    if (
      typeof line.unitPriceCents === "number" &&
      Number.isFinite(line.unitPriceCents)
    ) {
      return Math.round(line.unitPriceCents);
    }
    return Math.round(item.basePriceCents * clientMultiplier);
  }

  // On blur: if the owner changed the unit price, confirm before keeping it
  // (mirrors the invoice builder's guard against accidental price edits).
  function confirmUnitPrice(
    line: QuoteLineInput,
    item: PricingItem
  ) {
    const baselineDollars = priceAtFocus.current[line.pricingItemId];
    if (baselineDollars === undefined) return;
    const currentCents = effectiveUnitPriceCents(line, item);
    const baselineCents = dollarsToCents(baselineDollars);
    if (currentCents === baselineCents) return;
    const keep = window.confirm(
      `You changed the unit price for ${item.name} from ${formatCurrency(
        baselineCents
      )} to ${formatCurrency(currentCents)}.\n\nKeep this price change?`
    );
    if (!keep) {
      onUpdateUnitPrice(line.pricingItemId, baselineCents);
    }
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Adders
        </p>
        <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
          Select additional line items.
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <CatalogPicker
          items={availableItems}
          onPick={onAddLineItem}
          placeholder="Search the catalog to add an adder..."
          emptyLabel="All catalog adders are already on this quote."
        />

        <div className="rounded-soft border border-pine/10 bg-cream px-4 py-3 text-sm font-black text-deep-pine">
          {lineItems.length} selected
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl1 border border-pine/10">
        {lineItems.length === 0 ? (
          <div className="bg-cream p-5 text-sm font-bold text-charcoal/65">
            No adders selected yet.
          </div>
        ) : (
          <div className="divide-y divide-pine/10">
            {lineItems.map((lineItem) => {
              const item = items.find(
                (pricingItem) => pricingItem.id === lineItem.pricingItemId
              );

              if (!item) return null;

              const unitPriceCents = effectiveUnitPriceCents(lineItem, item);

              return (
                <div
                  key={lineItem.pricingItemId}
                  className="min-w-0 bg-cream p-4"
                >
                  <div className="min-w-0">
                    <p className="break-words font-black text-deep-pine">
                      {item.name}
                    </p>
                    <p className="break-words text-sm font-bold text-charcoal/60">
                      {item.category} &middot; {item.unitType} &middot; List{" "}
                      {formatCurrency(item.basePriceCents)}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[170px_190px_auto] sm:items-end sm:justify-between">
                    <label className="grid min-w-0 gap-1">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                        Qty
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={lineItem.quantity === 0 ? "" : lineItem.quantity}
                        onChange={(event) =>
                          onUpdateQuantity(
                            lineItem.pricingItemId,
                            event.target.value === ""
                              ? 0
                              : Number(event.target.value)
                          )
                        }
                        className="focus-ring h-12 w-full min-w-0 rounded-soft border border-pine/20 bg-whitewarm px-3 font-bold text-charcoal"
                      />
                    </label>

                    <label className="grid min-w-0 gap-1">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                        Unit Price
                      </span>
                      <div
                        className="flex items-center gap-1.5"
                        onFocus={() => {
                          priceAtFocus.current[lineItem.pricingItemId] =
                            centsToDollars(unitPriceCents);
                        }}
                      >
                        <span className="text-sm font-bold text-charcoal/55">
                          $
                        </span>
                        <FormattedNumberInput
                          value={centsToDollars(unitPriceCents)}
                          onChange={(dollars) =>
                            onUpdateUnitPrice(
                              lineItem.pricingItemId,
                              dollarsToCents(dollars)
                            )
                          }
                          allowDecimal
                          min={0}
                          onBlur={() => confirmUnitPrice(lineItem, item)}
                          className="form-input h-12 w-full min-w-0"
                        />
                      </div>
                    </label>

                    <button
                      type="button"
                      onClick={() => onRemoveLineItem(lineItem.pricingItemId)}
                      className="h-12 rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm sm:w-auto"
                    >
                      Remove
                    </button>
                  </div>

                  <label className="mt-3 flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                      Comment (shown on quote)
                    </span>
                    <textarea
                      value={lineItem.comment ?? ""}
                      onChange={(event) =>
                        onUpdateComment(lineItem.pricingItemId, event.target.value)
                      }
                      placeholder="Optional customer-facing note for this line..."
                      rows={2}
                      className="focus-ring w-full max-w-full resize-y rounded-soft border border-pine/20 bg-whitewarm px-3 py-2 text-sm font-bold text-charcoal"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}