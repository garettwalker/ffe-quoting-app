"use client";

import { pricingItems } from "@/lib/seed-data";
import type { QuoteLineInput } from "@/lib/types";
import { formatCurrency } from "@/lib/currency";

type QuoteLineItemPickerProps = {
  lineItems: QuoteLineInput[];
  onAddLineItem: (pricingItemId: string) => void;
  onUpdateQuantity: (pricingItemId: string, quantity: number) => void;
  onRemoveLineItem: (pricingItemId: string) => void;
};

export function QuoteLineItemPicker({
  lineItems,
  onAddLineItem,
  onUpdateQuantity,
  onRemoveLineItem
}: QuoteLineItemPickerProps) {
  const activeAdders = pricingItems.filter(
    (item) => item.active && item.category !== "Base"
  );

  const availableItems = activeAdders.filter(
    (item) =>
      !lineItems.some((lineItem) => lineItem.pricingItemId === item.id)
  );

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
        <select
          className="focus-ring min-h-12 min-w-0 rounded-soft border border-pine/20 bg-whitewarm px-4 font-bold text-charcoal"
          defaultValue=""
          onChange={(event) => {
            if (!event.target.value) return;
            onAddLineItem(event.target.value);
            event.target.value = "";
          }}
        >
          <option value="">Choose an item to add</option>
          {availableItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.category} - {item.name} - {formatCurrency(item.basePriceCents)}
            </option>
          ))}
        </select>

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
              const item = pricingItems.find(
                (pricingItem) => pricingItem.id === lineItem.pricingItemId
              );

              if (!item) return null;

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
                      {item.category} • {item.unitType} •{" "}
                      {formatCurrency(item.basePriceCents)}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[180px_auto] sm:items-end sm:justify-between">
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

                    <button
                      type="button"
                      onClick={() => onRemoveLineItem(lineItem.pricingItemId)}
                      className="h-12 rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm sm:w-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
