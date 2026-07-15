import { getSupabaseServer } from "@/lib/supabase-server";
import {
  fetchCrew,
  fetchScheduleRange,
  fetchSchedulableJobs
} from "@/lib/schedule";

// Server-only schedule data access. Each call builds a fresh server client (it
// reads the logged-in user's cookies, which are request-scoped — so it must be
// created inside the request, never at module load). The authenticated session
// is what lets RLS enforce admin-only / authenticated reads after the Phase C
// pass. Used by the server pages (app/schedule, app/pricing-admin).
//
// Keep this file server-only: it imports next/headers via lib/supabase-server,
// which cannot be pulled into a client bundle. Client-side reads (the board's
// week navigation) use lib/schedule-client instead.

export async function getCrew() {
  return fetchCrew(getSupabaseServer());
}

export async function getScheduleRange(from: string, to: string) {
  return fetchScheduleRange(getSupabaseServer(), from, to);
}

export async function getSchedulableJobs() {
  return fetchSchedulableJobs(getSupabaseServer());
}