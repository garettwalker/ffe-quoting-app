"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Crew, CrewRole } from "@/lib/schedule";
import {
  ActiveBadge,
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass,
  toggleButtonClass
} from "@/components/pricing-admin-ui";

type CrewEditorProps = {
  crew: Crew[];
};

const ROLES: { value: CrewRole; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "intern", label: "Intern / part-time" }
];

const emptyAdd = {
  name: "",
  role: "full_time" as CrewRole,
  color: "#344236",
  sortOrder: ""
};

export function CrewEditor({ crew }: CrewEditorProps) {
  const router = useRouter();

  const [add, setAdd] = useState(emptyAdd);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<CrewRole>("full_time");
  const [editColor, setEditColor] = useState("#344236");
  const [editSortOrder, setEditSortOrder] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  async function addCrew() {
    if (isSaving) return;
    if (!add.name.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("crew").insert({
      name: add.name.trim(),
      role: add.role,
      color: add.color,
      active: true,
      sort_order: Number(add.sortOrder) || crew.length
    });
    setIsSaving(false);
    if (error) {
      note(`Add failed: ${error.message}`, true);
      return;
    }
    setAdd(emptyAdd);
    note("Crew member added.");
    router.refresh();
  }

  function startEdit(member: Crew) {
    setEditingId(member.id);
    setEditName(member.name);
    setEditRole(member.role);
    setEditColor(member.color);
    setEditSortOrder(String(member.sortOrder));
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setMessage("");
  }

  async function saveEdit(member: Crew) {
    if (isSaving) return;
    if (!editName.trim()) {
      note("Name is required.", true);
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from("crew")
      .update({
        name: editName.trim(),
        role: editRole,
        color: editColor,
        sort_order: Number(editSortOrder) || 0
      })
      .eq("id", member.id);
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    setEditingId(null);
    note("Crew member updated.");
    router.refresh();
  }

  async function toggleActive(member: Crew) {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("crew")
      .update({ active: !member.active })
      .eq("id", member.id);
    setIsSaving(false);
    if (error) {
      note(`Update failed: ${error.message}`, true);
      return;
    }
    note(member.active ? "Crew member deactivated." : "Crew member activated.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Crew
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Who gets scheduled
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          Deactivate instead of deleting so past schedules keep their crew label.
          Deactivated crew stay here but won&apos;t show on the schedule board.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl1 border border-pine/10">
        {crew.length === 0 ? (
          <div className="bg-cream p-5 text-sm font-bold text-charcoal/65">
            No crew yet. Add Adam, Johnathan, and Peyton below (or run the seed in
            the README).
          </div>
        ) : (
          <div className="divide-y divide-pine/10">
            {crew.map((member) => (
              <div key={member.id} className="bg-cream p-4">
                {editingId === member.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Name">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="form-input"
                      />
                    </Field>
                    <Field label="Role">
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as CrewRole)}
                        className="form-input"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Calendar color">
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-12 w-16 cursor-pointer rounded-soft border border-pine/20 bg-whitewarm p-1"
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
                        onClick={() => saveEdit(member)}
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
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-5 w-5 shrink-0 rounded-full"
                        style={{ backgroundColor: member.color }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="font-black text-deep-pine">{member.name}</p>
                        <p className="text-sm font-bold text-charcoal/60">
                          {member.role === "full_time" ? "Full-time" : "Intern / part-time"}
                          {" • order "}
                          {member.sortOrder}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActiveBadge active={member.active} />
                      <button
                        type="button"
                        onClick={() => startEdit(member)}
                        className={toggleButtonClass}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(member)}
                        disabled={isSaving}
                        className={toggleButtonClass}
                      >
                        {member.active ? "Deactivate" : "Activate"}
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
          Add crew member
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input
              value={add.name}
              onChange={(e) => setAdd({ ...add, name: e.target.value })}
              className="form-input"
              placeholder="e.g. Adam"
            />
          </Field>
          <Field label="Role">
            <select
              value={add.role}
              onChange={(e) => setAdd({ ...add, role: e.target.value as CrewRole })}
              className="form-input"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Calendar color">
            <input
              type="color"
              value={add.color}
              onChange={(e) => setAdd({ ...add, color: e.target.value })}
              className="h-12 w-16 cursor-pointer rounded-soft border border-pine/20 bg-whitewarm p-1"
            />
          </Field>
          <Field label="Sort order">
            <input
              inputMode="numeric"
              value={add.sortOrder}
              onChange={(e) => setAdd({ ...add, sortOrder: e.target.value })}
              className="form-input"
              placeholder={String(crew.length)}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={addCrew}
              disabled={isSaving}
              className={primaryButtonClass}
            >
              Add crew
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