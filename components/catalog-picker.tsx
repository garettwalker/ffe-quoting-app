"use client";

import { useMemo, useRef, useState } from "react";

import { formatCurrency } from "@/lib/currency";

// Searchable catalog picker used to add an adder line on both the quote
// builder and the invoice builder. It replaces the old plain <select> dropdown
// (a long scroll once the catalog grows): type to filter by name or category,
// click a result to add it. One shared component so the two builders stay
// consistent. The caller passes only the items that are still available to add
// (already-selected items are excluded upstream) and an onPick that adds the
// line by pricingItemId.

export type CatalogPickerItem = {
  id: string;
  category: string;
  name: string;
  basePriceCents: number;
  unitType: string;
};

type CatalogPickerProps = {
  items: CatalogPickerItem[];
  onPick: (pricingItemId: string) => void;
  placeholder?: string;
  label?: string;
  emptyLabel?: string;
};

export function CatalogPicker({
  items,
  onPick,
  placeholder = "Search the catalog to add a line...",
  label,
  emptyLabel = "All catalog adders are already added."
}: CatalogPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.unitType.toLowerCase().includes(q)
    );
  }, [items, query]);

  function handlePick(id: string) {
    onPick(id);
    setQuery("");
    setOpen(false);
  }

  function clearBlur() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }

  // Delay closing on blur so a click on a result registers before the list
  // disappears.
  function scheduleClose() {
    clearBlur();
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  }

  if (items.length === 0) {
    return <p className="text-sm font-bold text-charcoal/55">{emptyLabel}</p>;
  }

  return (
    <div className="min-w-0">
      {label ? (
        <label className="mb-1 block text-xs font-black uppercase tracking-[0.1em] text-deep-pine">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            clearBlur();
            setOpen(true);
          }}
          onBlur={scheduleClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
            if (e.key === "Enter" && filtered.length === 1) {
              e.preventDefault();
              handlePick(filtered[0].id);
            }
          }}
          placeholder={placeholder}
          aria-label={label ?? "Search the catalog to add a line"}
          className="focus-ring form-input min-h-12 w-full"
        />

        {open ? (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-soft border border-pine/15 bg-whitewarm shadow-soft">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm font-bold text-charcoal/55">
                No items match "{query}".
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  // Prevent blur from closing the menu before the click fires.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePick(item.id)}
                  className="flex w-full items-center justify-between gap-3 border-b border-pine/8 px-4 py-3 text-left last:border-b-0 hover:bg-cream"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-black text-deep-pine">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs font-bold text-charcoal/55">
                      {item.category} &middot; {item.unitType}
                    </span>
                  </span>
                  <span className="shrink-0 font-black text-charcoal/70">
                    {formatCurrency(item.basePriceCents)}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}