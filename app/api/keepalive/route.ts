import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// GET /api/keepalive
// Public health-check used by the daily GitHub Actions cron
// (.github/workflows/keepalive.yml) to keep the Supabase free-tier project from
// pausing after 7 days of no inbound activity. It runs one trivial query (a
// head-count on `quotes`, so no rows are returned over the wire) so an inbound
// request reaches Supabase and the project counts as active, then returns 200.
//
// If the query errors, it returns 503 so the cron (curl -f) surfaces the
// failure in the Actions log instead of silently reporting success.
//
// Intentionally public and unauthenticated (it only counts rows; it reads and
// writes nothing sensitive). It is excluded from any future auth gate.
//
// Uses the service-role client (no user session): after the Phase C RLS pass,
// anonymous access to `quotes` is denied, so the anon key can no longer run
// this count. The service-role key bypasses RLS and is server-only (never sent
// to the browser).

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await getSupabaseAdmin()
    .from("quotes")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Supabase query failed." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}