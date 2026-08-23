"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { ProjectStatus } from "@/lib/types";
import {
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass,
  toggleButtonClass
} from "@/components/pricing-admin-ui";

// Inline editor for a job's 4 manual field-stage dates, opened from a project
// card's "Edit stages" button. Lets the owner back-date a stage completed
// earlier, correct a mistake, or clear a stage that was marked in error. The
// 4 derived stages (Quote / Rough-in Billed / Final Billed / Paid) are NOT
// editable here — they come from invoicing and payment facts. Saves the whole
// project_status object via the authenticated browser client (RLS-enforced),
// then router.refresh() so the strip re-renders.

const FIELDS: Array<{ key: keyof ProjectStatus; label: string }> = [
  { key: "roughIn", label: "Rough-in" },
  { key: "roughInInspection", label: "Rough-in inspection" },
  { key: "finish", label: "Finish" },
  { key: "finalInspection", label: "Final inspection" }
];

type Props = {
  quoteId: string;
  projectStatus: ProjectStatus;
};

export function ProjectStageEditor({ quoteId, projectStatus }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProjectStatus>(projectStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function notify(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  function openEditor() {
    setDraft(projectStatus);
    setMessage("");
    setOpen(true);
  }

  function setField(key: keyof ProjectStatus, value: string) {
    setDraft((d) => ({ ...d, [key]: value || null }));
  }

  function clearField(key: keyof ProjectStatus) {
    setDraft((d) => ({ ...d, [key]: null }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase
      .from("quotes")
      .update({ project_status: draft })
      .eq("id", quoteId);
    setSaving(false);
    if (error) {
      notify(`Save failed: ${error.message}`, true);
      return;
    }
    notify("Stages saved.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className={secondaryButtonClass}
      >
        Edit stages
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-soft border border-pine/15 bg-cream p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
        Field-stage dates
      </p>
      {FIELDS.map((f) => (
        <div key={f.key} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label={f.label}>
              <input
                type="date"
                value={draft[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="form-input"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => clearField(f.key)}
            className={toggleButtonClass}
          >
            Clear
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={primaryButtonClass}
        >
          {saving ? "Saving..." : "Save stages"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={secondaryButtonClass}
        >
          Cancel
        </button>
      </div>
      <SaveNote message={message} isError={isError} />
    </div>
  );
}