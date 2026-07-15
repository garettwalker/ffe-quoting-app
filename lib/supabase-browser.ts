"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase-env";

// Singleton browser client for Supabase Auth. Carries the logged-in user's
// session in cookies so auth-gated mutations enforce row-level security once
// the RLS pass lands. Created lazily so a missing env var fails at call time,
// not at import / build time.
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (browserClient) return browserClient;
  const { url, anonKey } = getSupabaseEnv();
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}