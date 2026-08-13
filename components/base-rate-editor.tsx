"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes after the Phase C pass.
const supabase = getSupabaseBrowser();
import type { BaseRate } from "@/lib/types";
import { centsToDollars, dollarsToCents } from "@/lib/currency";
import {
  ActiveBadge,
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass,
  toggleButtonClass
} from "@/components/pricing-admin-ui";

type BaseRateEditorProps = {
  baseRates: BaseRate[];
};

const emptyAdd = { name: "", rate: "", sortOrder: "" };

function makeId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "rate"}-${Date.now().toString(36)}`;
}

export function BaseRateEditor({ baseRates }: BaseRateEditorProps) {
  const router = useRouter();

  const [add, setAdd] = useState(emptyAdd);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  async function addRate() {
    if (isSaving) return;
    if (!add.name.trim()) {
      note("Name is required.", true);
      return;
    }
    const rateCents = dollarsToCents(Number(add.rate));
    if (!Number.isFinite(rateCents) || rateCents <= 0) {
      note("Enter a valid $/sf rate greater than 0.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("base_rates").insert({
      id: makeId(add.name),
      name: add.name.trim(),
      rate_cents: rateCents,
      active: true,
      sort_order: Number(add.sortOrder) || baseRates.length
    });
    setIsSaving(false);
    if (error) {
      note(`Add failed: ${error.message}`, true);
      return;
    }
    setAdd(emptyAdd);
    note("Base rate added.");
    router.refresh();
  }

  function startEdit(rate: BaseRate) {
    setEditingId(rate.id);
    setEditName(rate.name);
    setEditRate(String(centsToDollars(rate.rateCents)));
    setEditSortOrder(String(rate.sortOrder));
    setMessage("");
  }

  async function saveEdit(rate: BaseRate) {
    if (isSaving) return;
    if (!editName.trim()) {
      note("Name is required.", true);
      return;
    }
    const rateCents = dollarsToCents(Number(editRate));
    if (!Number.isFinite(rateCents) || rateCents <= 0) {
      note("Enter a valid $/sf rate greater than 0.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("base_rates")
      .update({
        name: editName.trim(),
        rate_cents: rateCents,
        sort_order: Number(editSortOrder) || 0
      })
      .eq("id", rate.id);
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    setEditingId(null);
    note("Base rate updated.");
    router.refresh();
  }

  async function toggleActive(rate: BaseRate) {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("base_rates")
      .update({ active: !rate.active })
      .eq("id", rate.id);
    setIsSaving(false);
    if (error) {
      note(`Update failed: ${error.message}`, true);
      return;
    }
    note(rate.active ? "Base rate deactivated." : "Base rate activated.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Base Rates
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Per-square-foot base-rate presets
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          The presets the owner picks from in the quote builder (e.g. Standard
          $6, Big complex $8). The quote stores the chosen rate as a snapshot, so
          editing a preset later does not move already-saved quotes. The owner can
          always type a custom rate in the builder even if no preset matches.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl1 border border-pine/10">
        {baseRates.length === 0 ? (
          <div className="bg-cream p-5 text-sm font-bold text-charcoal/65">
            No base-rate presets yet. Add one below (or run the base-rates SQL
            migration from the README to seed $5 through $12).
          </div>
        ) : (
          <div className="divide-y divide-pine/10">
            {baseRates.map((rate) => (
              <div key={rate.id} className="bg-cream p-4">
                {editingId === rate.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Name">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Rate ($/sf)">
                      <input
                        inputMode="decimal"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        className="form-input"
                        placeholder="6.00"
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
                        onClick={() => saveEdit(rate)}
                        disabled={isSaving}
                        className={primaryButtonClass}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-black text-deep-pine">{rate.name}</p>
                      <p className="text-sm font-bold text-charcoal/60">
                        ${centsToDollars(rate.rateCents).toFixed(2)}/sf • order{" "}
                        {rate.sortOrder}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActiveBadge active={rate.active} />
                      <button
                        type="button"
                        onClick={() => startEdit(rate)}
                        className={toggleButtonClass}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(rate)}
                        disabled={isSaving}
                        className={toggleButtonClass}
                      >
                        {rate.active ? "Deactivate" : "Activate"}
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
          Add new base rate
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input
              value={add.name}
              onChange={(e) => setAdd({ ...add, name: e.target.value })}
              className="form-input"
              placeholder="e.g. Big complex / all-in"
            />
          </Field>
          <Field label="Rate ($/sf)">
            <input
              inputMode="decimal"
              value={add.rate}
              onChange={(e) => setAdd({ ...add, rate: e.target.value })}
              className="form-input"
              placeholder="8.00"
            />
          </Field>
          <Field label="Sort order">
            <input
              inputMode="numeric"
              value={add.sortOrder}
              onChange={(e) => setAdd({ ...add, sortOrder: e.target.value })}
              className="form-input"
              placeholder={String(baseRates.length)}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={addRate}
              disabled={isSaving}
              className={primaryButtonClass}
            >
              Add base rate
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