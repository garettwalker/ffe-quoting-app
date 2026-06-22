"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { supabase } from "@/lib/supabase";
import type { PricingItem, UnitType } from "@/lib/types";
import {
  ActiveBadge,
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass,
  toggleButtonClass
} from "@/components/pricing-admin-ui";

type PricingItemEditorProps = {
  items: PricingItem[];
};

const UNIT_TYPES: UnitType[] = ["per_sqft", "per_unit", "flat", "per_hour"];

const emptyAdd = {
  category: "",
  name: "",
  unitType: "per_unit" as UnitType,
  baseDollars: "",
  sortOrder: ""
};

// Build a readable, unique-enough id from the item name. A timestamp suffix
// keeps two same-named adds from colliding.
function makeId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "item"}-${Date.now().toString(36)}`;
}

export function PricingItemEditor({ items }: PricingItemEditorProps) {
  const router = useRouter();

  const [add, setAdd] = useState(emptyAdd);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editName, setEditName] = useState("");
  const [editUnitType, setEditUnitType] = useState<UnitType>("per_unit");
  const [editBaseDollars, setEditBaseDollars] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  async function addItem() {
    if (isSaving) return;
    if (!add.name.trim() || !add.category.trim()) {
      note("Category and name are required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("pricing_items").insert({
      id: makeId(add.name),
      category: add.category.trim(),
      name: add.name.trim(),
      unit_type: add.unitType,
      base_price_cents: dollarsToCents(Number(add.baseDollars) || 0),
      active: true,
      sort_order: Number(add.sortOrder) || items.length
    });
    setIsSaving(false);
    if (error) {
      note(`Add failed: ${error.message}`, true);
      return;
    }
    setAdd(emptyAdd);
    note("Item added.");
    router.refresh();
  }

  function startEdit(item: PricingItem) {
    setEditingId(item.id);
    setEditCategory(item.category);
    setEditName(item.name);
    setEditUnitType(item.unitType);
    setEditBaseDollars(String(centsToDollars(item.basePriceCents)));
    setEditSortOrder(String(item.sortOrder));
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setMessage("");
  }

  async function saveEdit(item: PricingItem) {
    if (isSaving) return;
    if (!editName.trim() || !editCategory.trim()) {
      note("Category and name are required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("pricing_items")
      .update({
        category: editCategory.trim(),
        name: editName.trim(),
        unit_type: editUnitType,
        base_price_cents: dollarsToCents(Number(editBaseDollars) || 0),
        sort_order: Number(editSortOrder) || 0
      })
      .eq("id", item.id);
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    setEditingId(null);
    note("Item updated.");
    router.refresh();
  }

  async function toggleActive(item: PricingItem) {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("pricing_items")
      .update({ active: !item.active })
      .eq("id", item.id);
    setIsSaving(false);
    if (error) {
      note(`Update failed: ${error.message}`, true);
      return;
    }
    note(item.active ? "Item deactivated." : "Item activated.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Line Items
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Pricing items (adders + base)
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          Deactivate instead of deleting. Old quotes that reference a
          deactivated item still display correctly.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl1 border border-pine/10">
        {items.length === 0 ? (
          <div className="bg-cream p-5 text-sm font-bold text-charcoal/65">
            No pricing items yet. Add one below.
          </div>
        ) : (
          <div className="divide-y divide-pine/10">
            {items.map((item) => (
              <div key={item.id} className="bg-cream p-4">
                {editingId === item.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Category">
                      <input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Name">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Unit type">
                      <select
                        value={editUnitType}
                        onChange={(e) =>
                          setEditUnitType(e.target.value as UnitType)
                        }
                        className="form-input"
                      >
                        {UNIT_TYPES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Base price (dollars)">
                      <input
                        inputMode="decimal"
                        value={editBaseDollars}
                        onChange={(e) => setEditBaseDollars(e.target.value)}
                        className="form-input"
                        placeholder="0.00"
                      />
                    </Field>
                    <Field label="Sort order">
                      <input
                        inputMode="numeric"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(item)}
                        disabled={isSaving}
                        className={primaryButtonClass}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-black text-deep-pine">{item.name}</p>
                      <p className="text-sm font-bold text-charcoal/60">
                        {item.category} • {item.unitType} •{" "}
                        {formatCurrency(item.basePriceCents)} • order{" "}
                        {item.sortOrder}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActiveBadge active={item.active} />
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className={toggleButtonClass}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(item)}
                        disabled={isSaving}
                        className={toggleButtonClass}
                      >
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-soft border border-pine/10 bg-cream p-4">
        <p className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-clay">
          Add new item
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Category">
            <input
              value={add.category}
              onChange={(e) => setAdd({ ...add, category: e.target.value })}
              className="form-input"
              placeholder="e.g. Lighting"
            />
          </Field>
          <Field label="Name">
            <input
              value={add.name}
              onChange={(e) => setAdd({ ...add, name: e.target.value })}
              className="form-input"
              placeholder="e.g. Recessed LED Wafer"
            />
          </Field>
          <Field label="Unit type">
            <select
              value={add.unitType}
              onChange={(e) =>
                setAdd({ ...add, unitType: e.target.value as UnitType })
              }
              className="form-input"
            >
              {UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Base price (dollars)">
            <input
              inputMode="decimal"
              value={add.baseDollars}
              onChange={(e) => setAdd({ ...add, baseDollars: e.target.value })}
              className="form-input"
              placeholder="0.00"
            />
          </Field>
          <Field label="Sort order">
            <input
              inputMode="numeric"
              value={add.sortOrder}
              onChange={(e) => setAdd({ ...add, sortOrder: e.target.value })}
              className="form-input"
              placeholder={String(items.length)}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={addItem}
              disabled={isSaving}
              className={primaryButtonClass}
            >
              Add item
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <SaveNote message={message} isError={isError} />
      </div>
    </section>
  );
}