// Shared env reader for the Supabase auth clients (browser + server + middleware).
// Read lazily inside a function (not at module load) so a missing var fails at
// request time with a clear message instead of breaking the build.
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.");
  }
  return { url, anonKey };
}