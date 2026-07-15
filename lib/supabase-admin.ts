import { createClient } from "@supabase/supabase-js";
import type { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase-env";

// Server-only service-role client. Bypasses row-level security entirely — it
// is the database "superuser" key. Used ONLY where there is no user session to
// enforce RLS with: the keepalive health-check (a cron ping, no logged-in user)
// and the Stripe webhook + the public /pay page read. Never import this from a
// client component and never expose the key to the browser — unlike the anon
// key, this one is secret and is NOT prefixed with NEXT_PUBLIC_.
//
// Created lazily so a missing env var fails at call time, not at import / build
// time (the same pattern as the browser + server clients).
//
// The client is typed as the browser client's type (both are the same Supabase
// query-builder API; the only real difference is the key + auth options). This
// project has no generated Supabase types, so the app treats the clients as
// loosely typed (reads cast `data as RowType`, writes pass plain objects) — the
// service-role `createClient` default generic resolves table rows to `never`,
// which would reject those plain-object writes, so we cast it to the same loose
// type the browser/server clients already use.
type LooseSupabaseClient = ReturnType<typeof createBrowserClient>;
let adminClient: LooseSupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable (server-only)."
    );
  }
  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  }) as unknown as LooseSupabaseClient;
  return adminClient;
}