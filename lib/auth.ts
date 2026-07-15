import { getSupabaseServer } from "@/lib/supabase-server";

// App roles. `admin` = the owner + business owner (full access). `team_member`
// = crew (schedule-only; wired in a later phase). Role lives in the user's
// app_metadata (set in the Supabase dashboard, signed into the JWT) so it can't
// be self-edited. Default to the least-privileged role when unset.
export type AppRole = "admin" | "team_member";

export type AuthUser = {
  id: string;
  email: string;
  role: AppRole;
};

// Read the logged-in user + role from the server-side session. Returns null
// when there is no session.
export async function getServerUser(): Promise<AuthUser | null> {
  const supabase = getSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const rawRole = (user.app_metadata?.role as string | undefined) ?? "team_member";
  const role: AppRole = rawRole === "admin" ? "admin" : "team_member";
  return { id: user.id, email: user.email ?? "", role };
}

export async function isLoggedIn(): Promise<boolean> {
  return (await getServerUser()) !== null;
}

export async function isAdmin(): Promise<boolean> {
  const user = await getServerUser();
  return user?.role === "admin";
}