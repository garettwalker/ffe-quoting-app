import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase-env";

// Phase B: refresh the session on every request AND redirect unauthenticated
// users to /login for protected pages. API routes are NOT redirected here —
// each route enforces its own auth and returns a JSON 401/403 (a redirect would
// be wrong for an API call). Public paths never require a login: the login
// page itself, the customer pay link (+ success/canceled pages), and the
// keepalive + Stripe webhook endpoints.
const PUBLIC_PATHS = ["/login", "/pay", "/api/keepalive", "/api/stripe-webhook"];

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

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

  // Refresh the session (also refreshes the cookies on `response`).
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Logged-in users visiting /login are sent straight to the dashboard.
  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Unauthenticated users hitting a protected page are sent to /login.
  const isApi = path.startsWith("/api/");
  if (!user && !isApi && !isPublic(path)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  // Run on everything except static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"
  ]
};