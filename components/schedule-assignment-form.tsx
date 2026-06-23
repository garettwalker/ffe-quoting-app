"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  formatTimeRange,
  overlaps,
  phaseLabel,
  type Crew,
  type ScheduleAssignment,
  type SchedulePhase,
  type ScheduleStatus,
  type SchedulableJob
} from "@/lib/schedule";
import { Field, SaveNote, primaryButtonClass, secondaryButtonClass, toggleButtonClass } from "@/components/pricing-admin-ui";

type Mode = "quote" | "service";

type ScheduleAssignmentFormProps = {
  crew: Crew[]; // active crew only (board filters)
  jobs: SchedulableJob[];
  assignment: ScheduleAssignment | null; // null = add
  presetDate: string; // YYYY-MM-DD
  presetCrewId: string | null;
  // The current week's assignments, for the soft overlap warning.
  weekAssignments: ScheduleAssignment[];
  onDone: () => void;
  onCancel: () => void;
};

const STATUSES: { value: ScheduleStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" }
];

export function ScheduleAssignmentForm({
  crew,
  jobs,
  assignment,
  presetDate,
  presetCrewId,
  weekAssignments,
  onDone,
  onCancel
}: ScheduleAssignmentFormProps) {
  const existing = assignment;
  const [mode, setMode] = useState<Mode>(existing?.quoteId ? "quote" : "service");
  const [quoteId, setQuoteId] = useState<string>(existing?.quoteId ?? "");
  const [crewIds, setCrewIds] = useState<string[]>(
    existing?.crewIds ?? (presetCrewId ? [presetCrewId] : [])
  );
  const [phase, setPhase] = useState<SchedulePhase | null>(existing?.phase ?? "rough_in");
  const [title, setTitle] = useState<string>(existing?.title ?? "");
  const [location, setLocation] = useState<string>(existing?.location ?? "");
  const [workDate, setWorkDate] = useState<string>(existing?.workDate ?? presetDate);
  const [startTime, setStartTime] = useState<string>(existing?.startTime ?? "");
  const [endTime, setEndTime] = useState<string>(existing?.endTime ?? "");
  const [status, setStatus] = useState<ScheduleStatus>(existing?.status ?? "scheduled");
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  function toggleCrew(id: string) {
    setCrewIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function onJobChange(value: string) {
    setQuoteId(value);
    if (!value) return;
    const job = jobs.find((j) => j.id === value);
    if (!job) return;
    // Pre-fill the editable snapshot from the quote. Selecting a job is an explicit
    // action, so overwriting manual edits here is fine (and keeps title/location in
    // sync with the chosen job).
    setTitle(job.clientName);
    setLocation(job.fullAddress);
  }

  function switchMode(next: Mode) {
    setMode(next);
    if (next === "service") {
      setQuoteId("");
      setPhase(null);
    } else {
      // Returning to quote mode: restore a default phase if none set.
      setPhase(phase ?? "rough_in");
    }
  }

  // Soft overlap warning: any selected crew already on an overlapping entry.
  const draft: ScheduleAssignment = {
    id: existing?.id ?? "draft",
    quoteId: quoteId || null,
    crewIds,
    phase: mode === "service" ? null : phase,
    title,
    location,
    workDate,
    startTime: startTime || null,
    endTime: endTime || null,
    notes,
    status
  };
  const conflicts = weekAssignments.filter((other) => overlaps(draft, other));

  // Crew names shared with each conflicting entry, for the warning text.
  const conflictSummary = conflicts.map((c) => {
    const shared = c.crewIds
      .filter((id) => crewIds.includes(id))
      .map((id) => crew.find((m) => m.id === id)?.name ?? "crew")
      .join(", ");
    return { shared, time: formatTimeRange(c) };
  });

  async function save() {
    if (isSaving) return;
    if (crewIds.length === 0) {
      note("Pick at least one crew member.", true);
      return;
    }
    if (!workDate) {
      note("Pick a date.", true);
      return;
    }
    if (!title.trim()) {
      note(mode === "service" ? "Add a title (what the job is)." : "Add a title.", true);
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      note("End time should be after the start time.", true);
      return;
    }

    // The assignment row no longer holds crew directly; crew is written to the
    // schedule_assignment_crew join table so an entry can have several crew.
    const row = {
      quote_id: mode === "service" ? null : quoteId || null,
      phase: mode === "service" ? null : phase,
      title: title.trim(),
      location: location.trim(),
      work_date: workDate,
      start_time: startTime || null,
      end_time: endTime || null,
      notes: notes.trim(),
      status
    };

    setIsSaving(true);

    // Build the crew-link rows once (used for both insert and update paths).
    const links = crewIds.map((crew_id) => ({ crew_id }));

    let assignmentId = existing?.id ?? null;
    let error;

    if (existing) {
      // Update the assignment, then replace its crew set.
      ({ error } = await supabase
        .from("schedule_assignments")
        .update(row)
        .eq("id", existing.id));
      if (!error) {
        await supabase
          .from("schedule_assignment_crew")
          .delete()
          .eq("assignment_id", existing.id);
        if (links.length > 0) {
          await supabase
            .from("schedule_assignment_crew")
            .insert(links.map((l) => ({ ...l, assignment_id: existing.id })));
        }
      }
    } else {
      // Insert the assignment, grab its id, then write the crew links.
      const { data, error: insertError } = await supabase
        .from("schedule_assignments")
        .insert(row)
        .select("id")
        .single();
      error = insertError;
      if (!insertError && data) {
        assignmentId = data.id;
        if (links.length > 0) {
          const { error: linkError } = await supabase
            .from("schedule_assignment_crew")
            .insert(links.map((l) => ({ ...l, assignment_id: assignmentId })));
          error = linkError;
        }
      }
    }

    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    onDone();
  }

  async function remove() {
    if (!existing || isSaving) return;
    const ok = window.confirm("Delete this schedule entry? This can't be undone.");
    if (!ok) return;
    setIsSaving(true);
    const { error } = await supabase.from("schedule_assignments").delete().eq("id", existing.id);
    setIsSaving(false);
    if (error) {
      note(`Delete failed: ${error.message}`, true);
      return;
    }
    onDone();
  }

  return (
    <div className="max-h-[90vh] overflow-y-auto rounded-xl2 border border-pine/10 bg-whitewarm p-6 shadow-card">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
            {existing ? "Edit" : "Add"}
          </p>
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
            Schedule entry
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className={toggleButtonClass}
          aria-label="Close"
        >
          Close
        </button>
      </div>

      {/* Mode toggle */}
      <div className="mb-5 flex gap-2 rounded-full border border-pine/15 bg-cream p-1">
        <button
          type="button"
          onClick={() => switchMode("quote")}
          className={
            mode === "quote"
              ? "flex-1 rounded-full bg-pine px-4 py-2 text-sm font-black text-whitewarm"
              : "flex-1 rounded-full px-4 py-2 text-sm font-black text-charcoal/70 hover:bg-pine/10"
          }
        >
          Quote job
        </button>
        <button
          type="button"
          onClick={() => switchMode("service")}
          className={
            mode === "service"
              ? "flex-1 rounded-full bg-pine px-4 py-2 text-sm font-black text-whitewarm"
              : "flex-1 rounded-full px-4 py-2 text-sm font-black text-charcoal/70 hover:bg-pine/10"
          }
        >
          Service call / other
        </button>
      </div>

      <div className="grid gap-4">
        {mode === "quote" ? (
          <>
            <Field label="Job (accepted quote)">
              <select
                value={quoteId}
                onChange={(e) => onJobChange(e.target.value)}
                className="form-input"
              >
                <option value="">Select a job…</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.clientName} — {job.fullAddress} ({job.quoteId})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phase">
              <select
                value={phase ?? ""}
                onChange={(e) =>
                  setPhase((e.target.value || null) as SchedulePhase | null)
                }
                className="form-input"
              >
                <option value="">— none —</option>
                <option value="rough_in">Rough-In</option>
                <option value="finish">Finish</option>
              </select>
            </Field>
          </>
        ) : null}

        <Field label="Title (what shows on the board)">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="form-input"
            placeholder={
              mode === "service" ? "e.g. Service call — Smith residence" : "e.g. Smith residence"
            }
          />
        </Field>
        <Field label="Location / where">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="form-input"
            placeholder="Site address or area"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Crew (tap to add one or more)">
            <div className="flex flex-wrap gap-2">
              {crew.map((member) => {
                const selected = crewIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleCrew(member.id)}
                    aria-pressed={selected}
                    className={
                      selected
                        ? "flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-black text-whitewarm"
                        : "flex items-center gap-1.5 rounded-full border-2 border-pine/20 bg-whitewarm px-3 py-1.5 text-sm font-black text-charcoal/70 hover:bg-pine/10"
                    }
                    style={
                      selected
                        ? { backgroundColor: member.color, borderColor: member.color }
                        : undefined
                    }
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: selected ? "#fff" : member.color }}
                      aria-hidden
                    />
                    {member.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="form-input"
            />
          </Field>
          <Field label="Start time (leave blank for all-day)">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="form-input"
            />
          </Field>
          <Field label="End time (leave blank for open-ended)">
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="form-input"
            />
          </Field>
        </div>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ScheduleStatus)}
            className="form-input"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="form-input min-h-20"
            placeholder="Anything the crew should know"
          />
        </Field>

        {conflicts.length > 0 ? (
          <div className="rounded-soft border border-clay/30 bg-clay/10 px-3 py-2 text-sm font-bold text-clay">
            Heads up — overlapping entries on this day for a crew you picked:
            <ul className="mt-1 list-disc pl-5">
              {conflictSummary.map((c, i) => (
                <li key={i}>
                  {c.shared} ({c.time})
                </li>
              ))}
            </ul>
            Overlapping times are allowed — just making sure it&apos;s intentional.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className={primaryButtonClass}
          >
            {existing ? "Save changes" : "Add to schedule"}
          </button>
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            Cancel
          </button>
          {existing ? (
            <button
              type="button"
              onClick={remove}
              disabled={isSaving}
              className="ml-auto rounded-full border border-clay/40 px-4 py-2 text-xs font-black text-clay hover:bg-clay/10"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <SaveNote message={message} isError={isError} />
      </div>

      {existing && existing.quoteId ? (
        <p className="mt-3 text-xs font-bold text-charcoal/50">
          Linked to quote {phaseLabel(existing.phase) ? `${phaseLabel(existing.phase)} — ` : ""}
          <span className="text-deep-pine">{existing.quoteId}</span>
        </p>
      ) : null}
    </div>
  );
}