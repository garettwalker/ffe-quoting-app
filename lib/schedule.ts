import { supabase } from "@/lib/supabase";

// Scheduling: the owner schedules his crew (Adam, Johnathan, Peyton) onto rough-in
// and finish work for accepted quotes, plus free-form entries (service calls,
// warranty visits, supply runs) that have no quote. See the README scheduling
// section and components/schedule-* for the UI.

export type CrewRole = "full_time" | "intern";
export type SchedulePhase = "rough_in" | "finish";
export type ScheduleStatus = "scheduled" | "completed" | "cancelled";

export type Crew = {
  id: string;
  name: string;
  role: CrewRole;
  color: string;
  active: boolean;
  sortOrder: number;
};

export type ScheduleAssignment = {
  id: string;
  quoteId: string | null; // null = free-form / service call
  crewIds: string[]; // one or more crew on this entry (multi-select)
  phase: SchedulePhase | null; // null = no phase
  title: string;
  location: string;
  workDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM, null = all-day
  endTime: string | null; // HH:MM, null = open-ended
  notes: string;
  status: ScheduleStatus;
};

// An accepted quote that can be picked as a scheduled job. `id` is the quotes row
// uuid (what schedule_assignments.quote_id stores); `quoteId` is the display id.
export type SchedulableJob = {
  id: string;
  quoteId: string;
  clientName: string;
  fullAddress: string;
  projectType: string;
};

type CrewRow = {
  id: string;
  name: string;
  role: CrewRole;
  color: string;
  active: boolean;
  sort_order: number;
};

type AssignmentRow = {
  id: string;
  quote_id: string | null;
  phase: SchedulePhase | null;
  title: string;
  location: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string;
  status: ScheduleStatus;
};

// One row per (assignment, crew) in the linking table.
type AssignmentCrewRow = {
  assignment_id: string;
  crew_id: string;
};

type SchedulableJobRow = {
  id: string;
  quote_id: string;
  client_name: string;
  project_street: string;
  project_city: string;
  project_state: string;
  project_zip: string;
  project_type: string;
};

// Postgres `time` comes back as "HH:MM:SS"; normalize to "HH:MM" for inputs.
function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

// All crew, active first then by sort_order. The schedule board shows only active
// crew, but the crew editor shows all so deactivated members are still manageable.
export async function getCrew(): Promise<Crew[]> {
  const { data, error } = await supabase
    .from("crew")
    .select("id, name, role, color, active, sort_order")
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return (data as CrewRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    color: row.color,
    active: row.active,
    sortOrder: row.sort_order
  }));
}

// Every assignment in [from, to] inclusive (both YYYY-MM-DD), each with its crew
// set. Crew is fetched from the schedule_assignment_crew linking table in a second
// query (one assignment can have several crew). Unsorted beyond work_date; the
// board groups by day and sorts within (all-day first, then start time).
export async function getScheduleRange(from: string, to: string): Promise<ScheduleAssignment[]> {
  const { data, error } = await supabase
    .from("schedule_assignments")
    .select(
      "id, quote_id, phase, title, location, work_date, start_time, end_time, notes, status"
    )
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: true });

  if (error || !data) return [];
  const rows = data as AssignmentRow[];
  if (rows.length === 0) return [];

  // Pull the crew links for just these assignments and group by assignment_id.
  const { data: links, error: linkError } = await supabase
    .from("schedule_assignment_crew")
    .select("assignment_id, crew_id")
    .in(
      "assignment_id",
      rows.map((r) => r.id)
    );
  const crewByAssignment = new Map<string, string[]>();
  if (!linkError && links) {
    for (const link of links as AssignmentCrewRow[]) {
      const list = crewByAssignment.get(link.assignment_id) ?? [];
      list.push(link.crew_id);
      crewByAssignment.set(link.assignment_id, list);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    quoteId: row.quote_id,
    crewIds: crewByAssignment.get(row.id) ?? [],
    phase: row.phase,
    title: row.title,
    location: row.location,
    workDate: row.work_date,
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    notes: row.notes,
    status: row.status
  }));
}

// Accepted quotes that can be scheduled as jobs. Excludes draft/prepared (nothing
// to schedule yet) and is capped for the picker dropdown.
export async function getSchedulableJobs(): Promise<SchedulableJob[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, client_name, project_street, project_city, project_state, project_zip, project_type"
    )
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return (data as SchedulableJobRow[]).map((row) => ({
    id: row.id,
    quoteId: row.quote_id,
    clientName: row.client_name,
    fullAddress: [row.project_street, `${row.project_city}, ${row.project_state} ${row.project_zip}`]
      .filter(Boolean)
      .join(" · "),
    projectType: row.project_type
  }));
}

// Human label for a phase, for cards and the form.
export function phaseLabel(phase: SchedulePhase | null): string {
  if (phase === "rough_in") return "Rough-In";
  if (phase === "finish") return "Finish";
  return "";
}

// "8:00a" / "12:30p" from "HH:MM". Returns "" for empty.
export function formatTimeLabel(value: string | null): string {
  if (!value) return "";
  const [hStr, m] = value.split(":");
  let h = Number(hStr);
  const suffix = h >= 12 ? "p" : "a";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m}${suffix}`;
}

// "8:00a – 12:00p" or "All day" for an assignment.
export function formatTimeRange(assignment: ScheduleAssignment): string {
  if (!assignment.startTime && !assignment.endTime) return "All day";
  const start = formatTimeLabel(assignment.startTime);
  const end = formatTimeLabel(assignment.endTime);
  if (start && end) return `${start} – ${end}`;
  return start || end || "All day";
}

// True if two entries share at least one crew member and overlap in time on the
// same day. All-day (no times) is treated as non-overlapping with timed entries
// (a soft warning, not a block). Used for the multi-crew overlap warning.
export function overlaps(a: ScheduleAssignment, b: ScheduleAssignment): boolean {
  if (a.id === b.id) return false;
  if (a.workDate !== b.workDate) return false;
  if (!a.startTime || !b.startTime) return false; // all-day doesn't conflict
  const sharedCrew = a.crewIds.some((c) => b.crewIds.includes(c));
  if (!sharedCrew) return false;
  const aEnd = a.endTime ?? "23:59";
  const bEnd = b.endTime ?? "23:59";
  return a.startTime < bEnd && b.startTime < aEnd;
}