"use client";

import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { fetchScheduleRange } from "@/lib/schedule";

// Browser-only schedule reads. The schedule board navigates weeks client-side
// (loadWeek on prev/next/today + after a drag-to-reschedule), so it needs to
// re-fetch the week's assignments from the browser. The browser client carries
// the logged-in user's session, so RLS enforces the same authenticated read the
// server path uses. Only the week range is re-fetched client-side; crew and
// schedulable jobs come from the server page as props and don't change with the
// week.

export async function getScheduleRange(from: string, to: string) {
  return fetchScheduleRange(getSupabaseBrowser(), from, to);
}