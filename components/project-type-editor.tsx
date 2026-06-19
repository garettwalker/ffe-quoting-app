"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ProjectType } from "@/lib/types";
import {
  ActiveBadge,
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass,
  toggleButtonClass
} from "@/components/pricing-admin-ui";

type ProjectTypeEditorProps = {
  projectTypes: ProjectType[];
};

const emptyAdd = { name: "", sortOrder: "" };

function makeId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "project-type"}-${Date.now().toString(36)}`;
}

export function ProjectTypeEditor({ projectTypes }: ProjectTypeEditorProps) {
  const router = useRouter();

  const [add, setAdd] = useState(emptyAdd);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  async function addProjectType() {
    if (isSaving) return;
    if (!add.name.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("project_types").insert({
      id: makeId(add.name),
      name: add.name.trim(),
      active: true,
      sort_order: Number(add.sortOrder) || projectTypes.length
    });
    setIsSaving(false);
    if (error) {
      note(`Add failed: ${error.message}`, true);
      return;
    }
    setAdd(emptyAdd);
    note("Project type added.");
    router.refresh();
  }

  function startEdit(pt: ProjectType) {
    setEditingId(pt.id);
    setEditName(pt.name);
    setEditSortOrder(String(pt.sortOrder));
    setMessage("");
  }

  async function saveEdit(pt: ProjectType) {
    if (isSaving) return;
    if (!editName.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("project_types")
      .update({
        name: editName.trim(),
        sort_order: Number(editSortOrder) || 0
      })
      .eq("id", pt.id);
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    setEditingId(null);
    note("Project type updated.");
    router.refresh();
  }

  async function toggleActive(pt: ProjectType) {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("project_types")
      .update({ active: !pt.active })
      .eq("id", pt.id);
    setIsSaving(false);
    if (error) {
      note(`Update failed: ${error.message}`, true);
      return;
    }
    note(pt.active ? "Project type deactivated." : "Project type activated.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Project Types
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Project type options
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          Quotes store the display name, so renaming only affects new quotes —
          existing saved quotes keep their original value.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl1 border border-pine/10">
        {projectTypes.length === 0 ? (
          <div className="bg-cream p-5 text-sm font-bold text-charcoal/65">
            No project types yet. Add one below.
          </div>
        ) : (
          <div className="divide-y divide-pine/10">
            {projectTypes.map((pt) => (
              <div key={pt.id} className="bg-cream p-4">
                {editingId === pt.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Name">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
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
                    <div className="flex items-end gap-2 md:col-span-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(pt)}
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
                      <p className="font-black text-deep-pine">{pt.name}</p>
                      <p className="text-sm font-bold text-charcoal/60">
                        order {pt.sortOrder}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActiveBadge active={pt.active} />
                      <button
                        type="button"
                        onClick={() => startEdit(pt)}
                        className={toggleButtonClass}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(pt)}
                        disabled={isSaving}
                        className={toggleButtonClass}
                      >
                        {pt.active ? "Deactivate" : "Activate"}
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
          Add new project type
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input
              value={add.name}
              onChange={(e) => setAdd({ ...add, name: e.target.value })}
              className="form-input"
              placeholder="e.g. Custom Home"
            />
          </Field>
          <Field label="Sort order">
            <input
              inputMode="numeric"
              value={add.sortOrder}
              onChange={(e) => setAdd({ ...add, sortOrder: e.target.value })}
              className="form-input"
              placeholder={String(projectTypes.length)}
            />
          </Field>
          <div className="flex items-end md:col-span-2">
            <button
              type="button"
              onClick={addProjectType}
              disabled={isSaving}
              className={primaryButtonClass}
            >
              Add project type
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