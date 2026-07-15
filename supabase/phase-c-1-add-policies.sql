-- ============================================================================
-- Phase C, step C1: ADD authenticated/admin policies ALONGSIDE the existing
-- anon policies. The app keeps working on the anon policies until C2 swaps
-- the app to authenticated clients and C3 drops those anon policies.
--
-- Safe to run now. Safe to RE-RUN: every policy is dropped-if-exists first,
-- and the function is CREATE OR REPLACE.
--
-- Role source of truth: auth.users.raw_app_meta_data.role
--   'admin'         -> the owner + business owner (full access)
--   'team_member'   -> crew (schedule-only; wired in a later phase)
-- This is the same field lib/auth.ts reads, so server-side gates and
-- database-level RLS always agree.
--
-- is_admin() is SECURITY DEFINER so it can read auth.users (a caller cannot
-- read auth.users directly). It reads app_metadata straight from the table,
-- so it does not depend on which claims the JWT happens to carry.
-- ============================================================================

-- 0) Role helper. Stable + security-definer -> runs as the function owner
--    (postgres), which can read auth.users. auth.uid() still resolves to the
--    caller's id from the request JWT. Returns false for anon (no uid) and
--    for any authenticated user who is not an admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select raw_app_meta_data ->> 'role' from auth.users where id = auth.uid()),
    ''
  ) = 'admin';
$$;

-- Grant the quote-id generator to authenticated users (the anon grant stays
-- until C3). The browser client will call it as an authenticated user after
-- the C2 client swap; until then the currently-deployed anon client still
-- works because the anon grant is untouched.
grant execute on function public.next_quote_id(text) to authenticated;

-- ---------- quotes (admin only: read, create, edit, delete) ----------
drop policy if exists "admin select quotes" on public.quotes;
drop policy if exists "admin insert quotes" on public.quotes;
drop policy if exists "admin update quotes" on public.quotes;
drop policy if exists "admin delete quotes" on public.quotes;
create policy "admin select quotes" on public.quotes for select to authenticated using (public.is_admin());
create policy "admin insert quotes" on public.quotes for insert to authenticated with check (public.is_admin());
create policy "admin update quotes" on public.quotes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete quotes" on public.quotes for delete to authenticated using (public.is_admin());

-- ---------- email_log (admin only; append-only -> no update/delete) ----------
drop policy if exists "admin select email log" on public.email_log;
drop policy if exists "admin insert email log" on public.email_log;
create policy "admin select email log" on public.email_log for select to authenticated using (public.is_admin());
create policy "admin insert email log" on public.email_log for insert to authenticated with check (public.is_admin());

-- ---------- pricing_items (admin only) ----------
drop policy if exists "admin select pricing_items" on public.pricing_items;
drop policy if exists "admin insert pricing_items" on public.pricing_items;
drop policy if exists "admin update pricing_items" on public.pricing_items;
create policy "admin select pricing_items" on public.pricing_items for select to authenticated using (public.is_admin());
create policy "admin insert pricing_items" on public.pricing_items for insert to authenticated with check (public.is_admin());
create policy "admin update pricing_items" on public.pricing_items for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- pricing_levels (admin only) ----------
drop policy if exists "admin select pricing_levels" on public.pricing_levels;
drop policy if exists "admin insert pricing_levels" on public.pricing_levels;
drop policy if exists "admin update pricing_levels" on public.pricing_levels;
create policy "admin select pricing_levels" on public.pricing_levels for select to authenticated using (public.is_admin());
create policy "admin insert pricing_levels" on public.pricing_levels for insert to authenticated with check (public.is_admin());
create policy "admin update pricing_levels" on public.pricing_levels for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- contingency_options (admin only) ----------
drop policy if exists "admin select contingency_options" on public.contingency_options;
drop policy if exists "admin insert contingency_options" on public.contingency_options;
drop policy if exists "admin update contingency_options" on public.contingency_options;
create policy "admin select contingency_options" on public.contingency_options for select to authenticated using (public.is_admin());
create policy "admin insert contingency_options" on public.contingency_options for insert to authenticated with check (public.is_admin());
create policy "admin update contingency_options" on public.contingency_options for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- project_types (admin only) ----------
drop policy if exists "admin select project_types" on public.project_types;
drop policy if exists "admin insert project_types" on public.project_types;
drop policy if exists "admin update project_types" on public.project_types;
create policy "admin select project_types" on public.project_types for select to authenticated using (public.is_admin());
create policy "admin insert project_types" on public.project_types for insert to authenticated with check (public.is_admin());
create policy "admin update project_types" on public.project_types for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- app_settings (admin only) ----------
drop policy if exists "admin select app_settings" on public.app_settings;
drop policy if exists "admin insert app_settings" on public.app_settings;
drop policy if exists "admin update app_settings" on public.app_settings;
create policy "admin select app_settings" on public.app_settings for select to authenticated using (public.is_admin());
create policy "admin insert app_settings" on public.app_settings for insert to authenticated with check (public.is_admin());
create policy "admin update app_settings" on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- crew (all authenticated READ; admin writes) ----------
-- Crew names are needed by team members viewing the schedule, so reads are
-- open to any logged-in user. Adding/editing crew stays admin-only for now.
drop policy if exists "authenticated select crew" on public.crew;
drop policy if exists "admin insert crew" on public.crew;
drop policy if exists "admin update crew" on public.crew;
drop policy if exists "admin delete crew" on public.crew;
create policy "authenticated select crew" on public.crew for select to authenticated using (true);
create policy "admin insert crew" on public.crew for insert to authenticated with check (public.is_admin());
create policy "admin update crew" on public.crew for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete crew" on public.crew for delete to authenticated using (public.is_admin());

-- ---------- schedule_assignments (all authenticated READ; admin writes) ----------
drop policy if exists "authenticated select assignments" on public.schedule_assignments;
drop policy if exists "admin insert assignments" on public.schedule_assignments;
drop policy if exists "admin update assignments" on public.schedule_assignments;
drop policy if exists "admin delete assignments" on public.schedule_assignments;
create policy "authenticated select assignments" on public.schedule_assignments for select to authenticated using (true);
create policy "admin insert assignments" on public.schedule_assignments for insert to authenticated with check (public.is_admin());
create policy "admin update assignments" on public.schedule_assignments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete assignments" on public.schedule_assignments for delete to authenticated using (public.is_admin());

-- ---------- schedule_assignment_crew (all authenticated READ; admin writes) ----------
drop policy if exists "authenticated select assignment crew" on public.schedule_assignment_crew;
drop policy if exists "admin insert assignment crew" on public.schedule_assignment_crew;
drop policy if exists "admin update assignment crew" on public.schedule_assignment_crew;
drop policy if exists "admin delete assignment crew" on public.schedule_assignment_crew;
create policy "authenticated select assignment crew" on public.schedule_assignment_crew for select to authenticated using (true);
create policy "admin insert assignment crew" on public.schedule_assignment_crew for insert to authenticated with check (public.is_admin());
create policy "admin update assignment crew" on public.schedule_assignment_crew for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete assignment crew" on public.schedule_assignment_crew for delete to authenticated using (public.is_admin());