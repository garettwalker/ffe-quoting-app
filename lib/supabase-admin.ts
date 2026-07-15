import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase-env";

// Server-only service-role client. Bypasses row-level security entirely — it
// is the database "superuser" key. Used ONLY where there is no user session to
// enforce RLS with: the keepalive health-check (a cron ping, no logged-in user)
// and, later, the Stripe webhook. Never import this from a client component and
// never expose the key to the browser — unlike the anon key, this one is secret
// and is NOT prefixed with NEXT_PUBLIC_.
//
// Created lazily so a missing env var fails at call time, not at import / build
// time (the same pattern as the browser + server clients).
let adminClient: ReturnType<typeof createClient> | null = null;

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
  });
  return adminClient;
}