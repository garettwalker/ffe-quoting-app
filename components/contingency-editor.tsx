"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ContingencyOption } from "@/lib/types";
import {
  ActiveBadge,
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass,
  toggleButtonClass
} from "@/components/pricing-admin-ui";

type ContingencyEditorProps = {
  contingencies: ContingencyOption[];
};

const emptyAdd = { name: "", multiplier: "", sortOrder: "" };

function makeId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "contingency"}-${Date.now().toString(36)}`;
}

export function ContingencyEditor({ contingencies }: ContingencyEditorProps) {
  const router = useRouter();

  const [add, setAdd] = useState(emptyAdd);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMultiplier, setEditMultiplier] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  async function addContingency() {
    if (isSaving) return;
    if (!add.name.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("contingency_options").insert({
      id: makeId(add.name),
      name: add.name.trim(),
      multiplier: Number(add.multiplier) || 1,
      active: true,
      sort_order: Number(add.sortOrder) || contingencies.length
    });
    setIsSaving(false);
    if (error) {
      note(`Add failed: ${error.message}`, true);
      return;
    }
    setAdd(emptyAdd);
    note("Contingency added.");
    router.refresh();
  }

  function startEdit(option: ContingencyOption) {
    setEditingId(option.id);
    setEditName(option.name);
    setEditMultiplier(String(option.multiplier));
    setEditSortOrder(String(option.sortOrder));
    setMessage("");
  }

  async function saveEdit(option: ContingencyOption) {
    if (isSaving) return;
    if (!editName.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("contingency_options")
      .update({
        name: editName.trim(),
        multiplier: Number(editMultiplier) || 1,
        sort_order: Number(editSortOrder) || 0
      })
      .eq("id", option.id);
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    setEditingId(null);
    note("Contingency updated.");
    router.refresh();
  }

  async function toggleActive(option: ContingencyOption) {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("contingency_options")
      .update({ active: !option.active })
      .eq("id", option.id);
    setIsSaving(false);
    if (error) {
      note(`Update failed: ${error.message}`, true);
      return;
    }
    note(option.active ? "Contingency deactivated." : "Contingency activated.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Contingencies
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Contingency options
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          An extra multiplier on top of the pricing level (e.g. 1.05 = 5%
          contingency).
        </p>
      </div>

      <div className="overflow-hidden rounded-xl1 border border-pine/10">
        {contingencies.length === 0 ? (
          <div className="bg-cream p-5 text-sm font-bold text-charcoal/65">
            No contingencies yet. Add one below.
          </div>
        ) : (
          <div className="divide-y divide-pine/10">
            {contingencies.map((option) => (
              <div key={option.id} className="bg-cream p-4">
                {editingId === option.id ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Name">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Multiplier (e.g. 1.05)">
                      <input
                        inputMode="decimal"
                        value={editMultiplier}
                        onChange={(e) => setEditMultiplier(e.target.value)}
                        className="form-input"
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
                    <div className="flex items-end gap-2 md:col-span-3">
                      <button
                        type="button"
                        onClick={() => saveEdit(option)}
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
                      <p className="font-black text-deep-pine">{option.name}</p>
                      <p className="text-sm font-bold text-charcoal/60">
                        multiplier {option.multiplier} • order {option.sortOrder}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActiveBadge active={option.active} />
                      <button
                        type="button"
                        onClick={() => startEdit(option)}
                        className={toggleButtonClass}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(option)}
                        disabled={isSaving}
                        className={toggleButtonClass}
                      >
                        {option.active ? "Deactivate" : "Activate"}
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
          Add new contingency
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Name">
            <input
              value={add.name}
              onChange={(e) => setAdd({ ...add, name: e.target.value })}
              className="form-input"
              placeholder="e.g. 5%"
            />
          </Field>
          <Field label="Multiplier (e.g. 1.05)">
            <input
              inputMode="decimal"
              value={add.multiplier}
              onChange={(e) => setAdd({ ...add, multiplier: e.target.value })}
              className="form-input"
              placeholder="1.0"
            />
          </Field>
          <Field label="Sort order">
            <input
              inputMode="numeric"
              value={add.sortOrder}
              onChange={(e) => setAdd({ ...add, sortOrder: e.target.value })}
              className="form-input"
              placeholder={String(contingencies.length)}
            />
          </Field>
          <div className="flex items-end md:col-span-3">
            <button
              type="button"
              onClick={addContingency}
              disabled={isSaving}
              className={primaryButtonClass}
            >
              Add contingency
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