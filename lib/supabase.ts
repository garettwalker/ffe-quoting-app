import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.");
}

// Force every request to bypass Next.js's Data Cache (cache: "no-store").
// Without this, server components that read from Supabase (the dashboard) can
// return a stale snapshot and miss newly inserted rows, because supabase-js
// uses the global fetch which Next caches by default in the App Router. On the
// browser this option is harmless (it just skips the browser HTTP cache).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" })
  }
});