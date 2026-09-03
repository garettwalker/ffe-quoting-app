"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass
} from "@/components/pricing-admin-ui";

// Inline editor for a service call's manual stage, opened from a project
// card's "Edit stages" button. Only Accepted / Scheduled are stored state
// (quotes.status) — the Quote stage is automatic once the quote exists, and
// Billed / Paid are derived from invoicing + email facts, so they are NOT
// editable here (same philosophy as the new-build editor's derived stages:
// use the invoice page's Mark Paid for real money, and a sent email sets
// Billed). Saves via the authenticated browser client (RLS-enforced), then
// router.refresh() so the strip re-renders.

type ManualStage = "accepted" | "scheduled";

const CHOICES: Array<{ value: ManualStage; label: string; hint: string }> = [
  {
    value: "accepted",
    label: "Accepted",
    hint: "Job accepted, not yet on the schedule"
  },
  {
    value: "scheduled",
    label: "Scheduled",
    hint: "Crew is scheduled in the field"
  }
];

export function ServiceStageEditor({
  quoteId,
  status
}: {
  quoteId: string;
  status: ManualStage;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ManualStage>(status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function notify(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  function openEditor() {
    setDraft(status);
    setMessage("");
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    const supabase = getSupabaseBrowser();
    const { error } = await supabase
      .from("quotes")
      .update({ status: draft })
      .eq("id", quoteId);
    setSaving(false);
    if (error) {
      notify(`Save failed: ${error.message}`, true);
      return;
    }
    notify("Stage saved.");
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
        Service call stage
      </p>
      {CHOICES.map((choice) => {
        const active = draft === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            onClick={() => setDraft(choice.value)}
            className={`rounded-soft border p-3 text-left transition-colors ${
              active
                ? "border-pine bg-pine/10"
                : "border-pine/15 bg-whitewarm hover:bg-cream"
            }`}
          >
            <span
              className={`block text-sm font-black ${
                active ? "text-deep-pine" : "text-charcoal"
              }`}
            >
              {choice.label}
              {active ? " ✓" : ""}
            </span>
            <span className="block text-xs font-bold text-charcoal/55">
              {choice.hint}
            </span>
          </button>
        );
      })}
      <p className="text-xs font-bold text-charcoal/55">
        Quote is automatic once the quote exists. Billed and Paid update on
        their own from invoicing — set those on the quote's invoice page (send
        the invoice or Mark Paid).
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={primaryButtonClass}
        >
          {saving ? "Saving..." : "Save stage"}
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