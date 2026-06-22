"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { PricingLevel } from "@/lib/types";
import {
  ActiveBadge,
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass,
  toggleButtonClass
} from "@/components/pricing-admin-ui";

type PricingLevelEditorProps = {
  levels: PricingLevel[];
};

const emptyAdd = { name: "", multiplier: "", description: "", sortOrder: "" };

function makeId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "level"}-${Date.now().toString(36)}`;
}

export function PricingLevelEditor({ levels }: PricingLevelEditorProps) {
  const router = useRouter();

  const [add, setAdd] = useState(emptyAdd);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMultiplier, setEditMultiplier] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  async function addLevel() {
    if (isSaving) return;
    if (!add.name.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("pricing_levels").insert({
      id: makeId(add.name),
      name: add.name.trim(),
      multiplier: Number(add.multiplier) || 1,
      description: add.description.trim(),
      active: true,
      sort_order: Number(add.sortOrder) || levels.length
    });
    setIsSaving(false);
    if (error) {
      note(`Add failed: ${error.message}`, true);
      return;
    }
    setAdd(emptyAdd);
    note("Level added.");
    router.refresh();
  }

  function startEdit(level: PricingLevel) {
    setEditingId(level.id);
    setEditName(level.name);
    setEditMultiplier(String(level.multiplier));
    setEditDescription(level.description);
    setEditSortOrder(String(level.sortOrder));
    setMessage("");
  }

  async function saveEdit(level: PricingLevel) {
    if (isSaving) return;
    if (!editName.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("pricing_levels")
      .update({
        name: editName.trim(),
        multiplier: Number(editMultiplier) || 1,
        description: editDescription.trim(),
        sort_order: Number(editSortOrder) || 0
      })
      .eq("id", level.id);
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    setEditingId(null);
    note("Level updated.");
    router.refresh();
  }

  async function toggleActive(level: PricingLevel) {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("pricing_levels")
      .update({ active: !level.active })
      .eq("id", level.id);
    setIsSaving(false);
    if (error) {
      note(`Update failed: ${error.message}`, true);
      return;
    }
    note(level.active ? "Level deactivated." : "Level activated.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Pricing Levels
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Client pricing levels
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          A multiplier applied on top of the base price (e.g. 1.1 = 10% markup).
        </p>
      </div>

      <div className="overflow-hidden rounded-xl1 border border-pine/10">
        {levels.length === 0 ? (
          <div className="bg-cream p-5 text-sm font-bold text-charcoal/65">
            No pricing levels yet. Add one below.
          </div>
        ) : (
          <div className="divide-y divide-pine/10">
            {levels.map((level) => (
              <div key={level.id} className="bg-cream p-4">
                {editingId === level.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Name">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Multiplier (e.g. 1.1)">
                      <input
                        inputMode="decimal"
                        value={editMultiplier}
                        onChange={(e) => setEditMultiplier(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Description">
                      <input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
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
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(level)}
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
                      <p className="font-black text-deep-pine">{level.name}</p>
                      <p className="text-sm font-bold text-charcoal/60">
                        multiplier {level.multiplier} • {level.description || "none"}{" "}
                        • order {level.sortOrder}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActiveBadge active={level.active} />
                      <button
                        type="button"
                        onClick={() => startEdit(level)}
                        className={toggleButtonClass}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(level)}
                        disabled={isSaving}
                        className={toggleButtonClass}
                      >
                        {level.active ? "Deactivate" : "Activate"}
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
          Add new level
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input
              value={add.name}
              onChange={(e) => setAdd({ ...add, name: e.target.value })}
              className="form-input"
              placeholder="e.g. Builder"
            />
          </Field>
          <Field label="Multiplier (e.g. 1.1)">
            <input
              inputMode="decimal"
              value={add.multiplier}
              onChange={(e) => setAdd({ ...add, multiplier: e.target.value })}
              className="form-input"
              placeholder="1.0"
            />
          </Field>
          <Field label="Description">
            <input
              value={add.description}
              onChange={(e) => setAdd({ ...add, description: e.target.value })}
              className="form-input"
              placeholder="Short label shown in the dropdown"
            />
          </Field>
          <Field label="Sort order">
            <input
              inputMode="numeric"
              value={add.sortOrder}
              onChange={(e) => setAdd({ ...add, sortOrder: e.target.value })}
              className="form-input"
              placeholder={String(levels.length)}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={addLevel}
              disabled={isSaving}
              className={primaryButtonClass}
            >
              Add level
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