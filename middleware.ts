import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase-env";

// Phase A: refresh the auth session on every request so the session cookies
// stay valid. It does NOT redirect yet — the app stays fully open and usable.
// Phase B adds the redirect to /login for unauthenticated users (except the
// public routes: /login, /api/keepalive, and the future /pay/* + webhook).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // In-request copy needs only the value (path/domain options are for
          // the browser response below) — the 2-arg form also sidesteps a type
          // mismatch between @supabase/ssr's options and Next's request cookies.
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  // Refreshing the session also refreshes the cookies on `response`.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on everything except static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"
  ]
};