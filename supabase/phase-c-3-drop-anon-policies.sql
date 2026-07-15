-- ============================================================================
-- Phase C, step C3: DROP the wide-open anon policies now that the app uses the
-- logged-in session (C2) and the authenticated/admin policies from C1 are in
-- place. After this, anonymous access to every table is DENIED — only the
-- to-anon policies permitted anon before, and removing them leaves anon with
-- nothing. The app keeps working because it now authenticates as the logged-in
-- owner (role `authenticated`, gated by the admin/team-member policies).
--
-- Run this ONLY after C2 is deployed and verified live. Safe to re-run
-- (drop policy if exists is idempotent).
--
-- Rollback (if the app breaks): re-create the dropped policies from the SQL in
-- the README's per-table policy blocks (or restore from the Supabase dashboard
-- if you saved them). The app would then work on anon again while we diagnose.
-- ============================================================================

-- quotes
drop policy if exists "Allow browser insert quotes during app build" on public.quotes;
drop policy if exists "Allow browser read quotes during app build" on public.quotes;
drop policy if exists "Allow browser update quotes during app build" on public.quotes;
drop policy if exists "Allow browser delete quotes during app build" on public.quotes;

-- email_log (append-only)
drop policy if exists "Allow browser read email log" on public.email_log;
drop policy if exists "Allow browser insert email log" on public.email_log;

-- pricing_items / pricing_levels / contingency_options / project_types
drop policy if exists "Allow browser insert pricing during app build" on public.pricing_items;
drop policy if exists "Allow browser read pricing during app build" on public.pricing_items;
drop policy if exists "Allow browser update pricing during app build" on public.pricing_items;
drop policy if exists "Allow browser insert pricing during app build" on public.pricing_levels;
drop policy if exists "Allow browser read pricing during app build" on public.pricing_levels;
drop policy if exists "Allow browser update pricing during app build" on public.pricing_levels;
drop policy if exists "Allow browser insert pricing during app build" on public.contingency_options;
drop policy if exists "Allow browser read pricing during app build" on public.contingency_options;
drop policy if exists "Allow browser update pricing during app build" on public.contingency_options;
drop policy if exists "Allow browser insert pricing during app build" on public.project_types;
drop policy if exists "Allow browser read pricing during app build" on public.project_types;
drop policy if exists "Allow browser update pricing during app build" on public.project_types;

-- app_settings
drop policy if exists "Allow browser insert settings during app build" on public.app_settings;
drop policy if exists "Allow browser read settings during app build" on public.app_settings;
drop policy if exists "Allow browser update settings during app build" on public.app_settings;

-- crew
drop policy if exists "Allow browser read crew" on public.crew;
drop policy if exists "Allow browser insert crew" on public.crew;
drop policy if exists "Allow browser update crew" on public.crew;
drop policy if exists "Allow browser delete crew" on public.crew;

-- schedule_assignments
drop policy if exists "Allow browser read assignments" on public.schedule_assignments;
drop policy if exists "Allow browser insert assignments" on public.schedule_assignments;
drop policy if exists "Allow browser update assignments" on public.schedule_assignments;
drop policy if exists "Allow browser delete assignments" on public.schedule_assignments;

-- schedule_assignment_crew
drop policy if exists "Allow browser read assignment crew" on public.schedule_assignment_crew;
drop policy if exists "Allow browser insert assignment crew" on public.schedule_assignment_crew;
drop policy if exists "Allow browser update assignment crew" on public.schedule_assignment_crew;
drop policy if exists "Allow browser delete assignment crew" on public.schedule_assignment_crew;

-- Revoke the anon grant on the quote-id generator. Authenticated users (the
-- C2 browser client) and the service role can still call it; the function is
-- security-definer so it bypasses RLS on the counter table regardless. This
-- closes the "anyone with the anon key can burn quote numbers" gap.
revoke execute on function public.next_quote_id(text) from anon;

-- ============================================================================
-- Verification (run after, separately): confirm NO anon policies remain.
--   select tablename, policyname, roles, cmd
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
-- Every row's `roles` should be {authenticated} (never {anon}).
-- ============================================================================