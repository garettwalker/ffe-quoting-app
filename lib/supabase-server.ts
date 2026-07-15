import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "@/lib/supabase-env";

// Server-side client (server components + route handlers). Reads the logged-in
// user's session from cookies so server reads can be RLS-enforced after the
// RLS pass. Session *refresh* happens in middleware; the `setAll` here is a
// no-op in the read-only server-component context (wrapped so it never throws
// there) — see the @supabase/ssr pattern.
export function getSupabaseServer() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component (read-only cookies). Ignored —
          // middleware refreshes the session.
        }
      }
    }
  });
}