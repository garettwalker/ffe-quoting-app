"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  formatTimeRange,
  getScheduleRange,
  phaseLabel,
  type Crew,
  type ScheduleAssignment,
  type SchedulableJob
} from "@/lib/schedule";
import { ScheduleAssignmentForm } from "@/components/schedule-assignment-form";

type ScheduleBoardProps = {
  crew: Crew[]; // active crew only (server filters)
  jobs: SchedulableJob[];
  initialAssignments: ScheduleAssignment[];
  weekStartISO: string; // Monday of the current week (YYYY-MM-DD)
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Parse a YYYY-MM-DD string as local time (avoiding UTC-offset drift).
function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

// Format a Date as YYYY-MM-DD using local components.
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, n: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

function startOfWeek(date: Date): Date {
  // JS getDay(): 0=Sun..6=Sat. Monday-based offset.
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

function weekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const start = monday.toLocaleDateString("en-US", opts);
  const end = sunday.toLocaleDateString(
    "en-US",
    monday.getFullYear() === sunday.getFullYear()
      ? opts
      : { month: "short", day: "numeric", year: "numeric" }
  );
  const year = monday.getFullYear();
  return `${start} – ${end}, ${year}`;
}

type ModalState = {
  open: boolean;
  assignment: ScheduleAssignment | null;
  presetDate: string;
  presetCrewId: string | null;
};

export function ScheduleBoard({
  crew,
  jobs,
  initialAssignments,
  weekStartISO
}: ScheduleBoardProps) {
  const [weekStart, setWeekStart] = useState<Date>(parseISO(weekStartISO));
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>(initialAssignments);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    open: false,
    assignment: null,
    presetDate: weekStartISO,
    presetCrewId: null
  });

  const crewById = useMemo(() => {
    const map = new Map<string, Crew>();
    crew.forEach((c) => map.set(c.id, c));
    return map;
  }, [crew]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Assignments grouped by YYYY-MM-DD, each day's list sorted by crew order then
  // all-day-first then start time.
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleAssignment[]>();
    for (const a of assignments) {
      const list = map.get(a.workDate) ?? [];
      list.push(a);
      map.set(a.workDate, list);
    }
    map.forEach((list, date) => {
      list.sort((a, b) => {
        // Sort by the earliest crew (smallest sort_order) on each entry.
        const ca = Math.min(
          ...(a.crewIds.map((id) => crewById.get(id)?.sortOrder ?? 999).length
            ? a.crewIds.map((id) => crewById.get(id)?.sortOrder ?? 999)
            : [999])
        );
        const cb = Math.min(
          ...(b.crewIds.map((id) => crewById.get(id)?.sortOrder ?? 999).length
            ? b.crewIds.map((id) => crewById.get(id)?.sortOrder ?? 999)
            : [999])
        );
        if (ca !== cb) return ca - cb;
        const ta = a.startTime ?? "99:99"; // all-day sorts first
        const tb = b.startTime ?? "99:99";
        if (ta === "99:99" && tb !== "99:99") return -1;
        if (tb === "99:99" && ta !== "99:99") return 1;
        return ta.localeCompare(tb);
      });
      map.set(date, list);
    });
    return map;
  }, [assignments, crewById]);

  async function loadWeek(start: Date) {
    setWeekStart(start);
    setLoading(true);
    const from = toISODate(start);
    const to = toISODate(addDays(start, 6));
    const result = await getScheduleRange(from, to);
    setAssignments(result);
    setLoading(false);
  }

  function openAdd(presetDate: string, presetCrewId: string | null = null) {
    setModal({ open: true, assignment: null, presetDate, presetCrewId });
  }

  function openEdit(assignment: ScheduleAssignment) {
    setModal({
      open: true,
      assignment,
      presetDate: assignment.workDate,
      presetCrewId: null
    });
  }

  function closeModal() {
    setModal((prev) => ({ ...prev, open: false }));
  }

  function onDone() {
    closeModal();
    loadWeek(weekStart);
  }

  function isToday(date: Date): boolean {
    return toISODate(date) === toISODate(new Date());
  }

  if (crew.length === 0) {
    return (
      <div className="rounded-xl2 border border-clay/30 bg-clay/10 p-5 text-sm font-black text-clay">
        No active crew yet. Add Adam, Johnathan, and Peyton under Pricing → Crew
        (or run the seed in the README), then come back here to schedule.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Week navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadWeek(addDays(weekStart, -7))}
            className="rounded-full border border-pine/20 bg-whitewarm px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine/10"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            onClick={() => loadWeek(startOfWeek(new Date()))}
            className="rounded-full border border-pine/20 bg-whitewarm px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine/10"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => loadWeek(addDays(weekStart, 7))}
            className="rounded-full border border-pine/20 bg-whitewarm px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine/10"
          >
            Next ›
          </button>
        </div>
        <p className="font-display text-xl font-bold tracking-[-0.02em] text-moss">
          {weekLabel(weekStart)}
        </p>
        <button
          type="button"
          onClick={() => openAdd(toISODate(new Date()))}
          className="rounded-full bg-pine px-5 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
        >
          + Add entry
        </button>
      </div>

      {loading ? (
        <p className="text-sm font-bold text-charcoal/60">Loading week…</p>
      ) : null}

      {/* Week: stacked day cards on mobile, 7-column grid on desktop. */}
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((date, i) => {
          const iso = toISODate(date);
          const dayAssignments = byDate.get(iso) ?? [];
          const today = isToday(date);
          return (
            <div
              key={iso}
              className={
                today
                  ? "rounded-xl2 border border-pine/30 bg-cream p-3 shadow-soft"
                  : "rounded-xl2 border border-pine/10 bg-whitewarm/75 p-3 shadow-soft"
              }
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                    {DAY_NAMES[i]}
                  </p>
                  <p
                    className={
                      today
                        ? "font-display text-lg font-bold text-deep-pine"
                        : "font-display text-lg font-bold text-moss"
                    }
                  >
                    {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openAdd(iso)}
                  className="rounded-full border border-pine/20 px-2 py-1 text-xs font-black text-deep-pine hover:bg-pine/10"
                  aria-label={`Add entry on ${iso}`}
                >
                  +
                </button>
              </div>

              <div className="space-y-2">
                {dayAssignments.length === 0 ? (
                  <p className="rounded-soft px-1 py-3 text-center text-xs font-bold text-charcoal/40">
                    No jobs
                  </p>
                ) : (
                  dayAssignments.map((a) => (
                    <AssignmentCard
                      key={a.id}
                      assignment={a}
                      crew={a.crewIds
                        .map((id) => crewById.get(id))
                        .filter((c): c is Crew => Boolean(c))}
                      onEdit={() => openEdit(a)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-charcoal/60">
        <span>Crew:</span>
        {crew.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            {c.name}
          </span>
        ))}
      </div>

      {/* Add / edit modal */}
      {modal.open ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-charcoal/40 p-4 py-8 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <ScheduleAssignmentForm
              crew={crew}
              jobs={jobs}
              assignment={modal.assignment}
              presetDate={modal.presetDate}
              presetCrewId={modal.presetCrewId}
              weekAssignments={assignments}
              onDone={onDone}
              onCancel={closeModal}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssignmentCard({
  assignment,
  crew,
  onEdit
}: {
  assignment: ScheduleAssignment;
  crew: Crew[];
  onEdit: () => void;
}) {
  const phase = phaseLabel(assignment.phase);
  const cancelled = assignment.status === "cancelled";
  const completed = assignment.status === "completed";
  return (
    <button
      type="button"
      onClick={onEdit}
      className="block w-full rounded-xl1 border border-pine/10 bg-whitewarm p-3 text-left shadow-soft hover:border-pine/30"
    >
      <div className="mb-1 flex items-center gap-1.5">
        {crew.length > 0 ? (
          <span className="flex shrink-0 items-center -space-x-1">
            {crew.map((c) => (
              <span
                key={c.id}
                className="h-2.5 w-2.5 rounded-full border border-whitewarm"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
            ))}
          </span>
        ) : (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: "#344236" }}
            aria-hidden
          />
        )}
        <span className="text-xs font-black text-charcoal/70">
          {crew.length > 0
            ? crew.map((c) => c.name).join(", ")
            : "Unassigned"}
        </span>
        <span className="ml-auto text-xs font-bold text-charcoal/55">
          {formatTimeRange(assignment)}
        </span>
      </div>
      <p
        className={
          cancelled
            ? "font-black text-charcoal/40 line-through"
            : completed
              ? "font-black text-charcoal/50"
              : "font-black text-deep-pine"
        }
      >
        {assignment.title || "(untitled)"}
      </p>
      {assignment.location ? (
        <p className="truncate text-xs font-bold text-charcoal/55">{assignment.location}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {phase ? (
          <span className="rounded-full bg-pine/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-deep-pine">
            {phase}
          </span>
        ) : null}
        {assignment.notes ? (
          <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-charcoal/50">
            notes
          </span>
        ) : null}
        {completed ? (
          <span className="rounded-full bg-sage/30 px-2 py-0.5 text-[10px] font-black text-deep-pine">
            Done
          </span>
        ) : null}
        {cancelled ? (
          <span className="rounded-full bg-stone/40 px-2 py-0.5 text-[10px] font-black text-charcoal/60">
            Cancelled
          </span>
        ) : null}
        {assignment.quoteId ? (
          <Link
            href={`/quotes/${assignment.quoteId}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full px-2 py-0.5 text-[10px] font-black text-clay underline decoration-clay/40 underline-offset-2 hover:text-deep-pine"
          >
            view job
          </Link>
        ) : null}
      </div>
    </button>
  );
}