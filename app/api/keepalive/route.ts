import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await supabase
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