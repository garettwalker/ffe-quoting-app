import { getSupabaseServer } from "@/lib/supabase-server";

// Server-only companion to lib/projects.ts. Holds the one helper that needs a
// Supabase server client (and therefore next/headers). Kept out of lib/projects
// so that module stays client-safe (project-advance-button imports pure helpers
// + types from it). Mirrors the lib/schedule -> lib/schedule-server split.

// Distinct crew names on a quote's non-cancelled rough-in / finish schedule
// assignments, for the "Crew: James, Devon" context line on a project card.
// Returns a Map keyed by quote id (empty array = unassigned / unscheduled).
// Self-contained: three targeted queries (assignments, crew links, crew names).
export async function fetchScheduleForQuotes(
  quoteIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (quoteIds.length === 0) return out;
  const supabase = getSupabaseServer();
  const { data: assignments, error } = await supabase
    .from("schedule_assignments")
    .select("id, quote_id, phase, status")
    .in("quote_id", quoteIds)
    .neq("status", "cancelled");
  if (error || !assignments) return out;
  const rows = assignments as Array<{
    id: string;
    quote_id: string | null;
    phase: string | null;
    status: string;
  }>;
  if (rows.length === 0) return out;

  const { data: links } = await supabase
    .from("schedule_assignment_crew")
    .select("assignment_id, crew_id")
    .in("assignment_id", rows.map((r) => r.id));
  const crewByAssignment = new Map<string, string[]>();
  if (links) {
    for (const link of links as Array<{
      assignment_id: string;
      crew_id: string;
    }>) {
      const list = crewByAssignment.get(link.assignment_id) ?? [];
      list.push(link.crew_id);
      crewByAssignment.set(link.assignment_id, list);
    }
  }

  const crewIds = new Set<string>();
  for (const r of rows) {
    for (const cid of crewByAssignment.get(r.id) ?? []) crewIds.add(cid);
  }
  const nameById = new Map<string, string>();
  if (crewIds.size > 0) {
    const { data: crewRows } = await supabase
      .from("crew")
      .select("id, name")
      .in("id", Array.from(crewIds));
    if (crewRows) {
      for (const c of crewRows as Array<{ id: string; name: string }>) {
        nameById.set(c.id, c.name);
      }
    }
  }

  for (const r of rows) {
    if (!r.quote_id) continue;
    const names = (crewByAssignment.get(r.id) ?? [])
      .map((cid) => nameById.get(cid))
      .filter((n): n is string => Boolean(n));
    const list = out.get(r.quote_id) ?? [];
    for (const n of names) {
      if (!list.includes(n)) list.push(n);
    }
    out.set(r.quote_id, list);
  }
  return out;
}