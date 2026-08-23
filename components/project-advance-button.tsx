"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { todayDateOnly, type ProjectStatus, type StageId } from "@/lib/projects";
import { primaryButtonClass, secondaryButtonClass } from "@/components/pricing-admin-ui";

// The primary action button on a project card's footer. When the active stage
// is a MANUAL field stage, this stamps today's date into the matching
// project_status field (via the authenticated browser client, RLS-enforced)
// and refreshes. When the active stage is a DERIVED billing/paid stage, there
// is no tracker click — the action is in the invoicing flow, so this renders a
// contextual link to the invoicing page instead. When the job is complete,
// nothing renders (the page shows a "Completed" pill instead).

const MANUAL_LABELS: Partial<Record<StageId, string>> = {
  roughIn: "Mark rough-in complete",
  roughInInspection: "Rough-in inspection passed",
  finish: "Mark finish complete",
  finalInspection: "Final inspection passed"
};

// Map a manual stage id to its project_status key.
const STAGE_KEY: Partial<Record<StageId, keyof ProjectStatus>> = {
  roughIn: "roughIn",
  roughInInspection: "roughInInspection",
  finish: "finish",
  finalInspection: "finalInspection"
};

type Props = {
  quoteId: string;
  projectStatus: ProjectStatus;
  activeStageId: StageId | null;
};

export function ProjectAdvanceButton({ quoteId, projectStatus, activeStageId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (activeStageId === null) return null;

  // Derived stages: hand off to the invoicing flow (no tracker click).
  if (activeStageId === "roughInBilled") {
    return (
      <Link
        href={`/quotes/${quoteId}/invoices`}
        className={primaryButtonClass}
      >
        Send rough-in invoice
      </Link>
    );
  }
  if (activeStageId === "finalBilled") {
    return (
      <Link
        href={`/quotes/${quoteId}/invoices`}
        className={primaryButtonClass}
      >
        Send final invoice
      </Link>
    );
  }
  if (activeStageId === "paid") {
    return (
      <Link
        href={`/quotes/${quoteId}/invoices`}
        className={secondaryButtonClass}
      >
        Awaiting payment
      </Link>
    );
  }

  // Manual field stage: stamp today's date into the matching field.
  const key = STAGE_KEY[activeStageId];
  const label = MANUAL_LABELS[activeStageId];
  if (!key || !label) return null;
  const fieldKey: keyof ProjectStatus = key;

  async function markComplete() {
    if (saving) return;
    setSaving(true);
    setError("");
    const next: ProjectStatus = { ...projectStatus, [fieldKey]: todayDateOnly() };
    const supabase = getSupabaseBrowser();
    const { error: err } = await supabase
      .from("quotes")
      .update({ project_status: next })
      .eq("id", quoteId);
    setSaving(false);
    if (err) {
      setError(err.message || "Could not update stage.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={markComplete}
        disabled={saving}
        className={primaryButtonClass}
      >
        {saving ? "Saving..." : label}
      </button>
      {error ? (
        <span className="text-xs font-bold text-clay">{error}</span>
      ) : null}
    </div>
  );
}