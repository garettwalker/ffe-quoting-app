-- ============================================================================
-- ROLLBACK for Phase C3. Run this ONLY if dropping the anon policies (C3) broke
-- the live app. It re-creates the wide-open anon policies so the app works on
-- anon again while we diagnose. (This is the pre-C3 posture: anon + the C1
-- authenticated/admin policies both exist; anon is redundant but harmless.)
--
-- After fixing the root cause, re-run phase-c-3-drop-anon-policies.sql to drop
-- them again.
-- ============================================================================

-- quotes
create policy "Allow browser insert quotes during app build" on public.quotes for insert to anon with check (true);
create policy "Allow browser read quotes during app build"   on public.quotes for select to anon using (true);
create policy "Allow browser update quotes during app build" on public.quotes for update to anon using (true) with check (true);
create policy "Allow browser delete quotes during app build" on public.quotes for delete to anon using (true);

-- email_log
create policy "Allow browser read email log"  on public.email_log for select to anon using (true);
create policy "Allow browser insert email log" on public.email_log for insert to anon with check (true);

-- pricing_items / pricing_levels / contingency_options / project_types
create policy "Allow browser insert pricing during app build" on public.pricing_items       for insert to anon with check (true);
create policy "Allow browser read pricing during app build"   on public.pricing_items       for select to anon using (true);
create policy "Allow browser update pricing during app build" on public.pricing_items       for update to anon using (true) with check (true);
create policy "Allow browser insert pricing during app build" on public.pricing_levels      for insert to anon with check (true);
create policy "Allow browser read pricing during app build"   on public.pricing_levels      for select to anon using (true);
create policy "Allow browser update pricing during app build" on public.pricing_levels      for update to anon using (true) with check (true);
create policy "Allow browser insert pricing during app build" on public.contingency_options for insert to anon with check (true);
create policy "Allow browser read pricing during app build"   on public.contingency_options for select to anon using (true);
create policy "Allow browser update pricing during app build" on public.contingency_options for update to anon using (true) with check (true);
create policy "Allow browser insert pricing during app build" on public.project_types       for insert to anon with check (true);
create policy "Allow browser read pricing during app build"   on public.project_types       for select to anon using (true);
create policy "Allow browser update pricing during app build" on public.project_types       for update to anon using (true) with check (true);

-- app_settings
create policy "Allow browser insert settings during app build" on public.app_settings for insert to anon with check (true);
create policy "Allow browser read settings during app build"  on public.app_settings for select to anon using (true);
create policy "Allow browser update settings during app build" on public.app_settings for update to anon using (true) with check (true);

-- crew
create policy "Allow browser read crew"  on public.crew for select to anon using (true);
create policy "Allow browser insert crew" on public.crew for insert to anon with check (true);
create policy "Allow browser update crew" on public.crew for update to anon using (true) with check (true);
create policy "Allow browser delete crew" on public.crew for delete to anon using (true);

-- schedule_assignments
create policy "Allow browser read assignments"  on public.schedule_assignments for select to anon using (true);
create policy "Allow browser insert assignments" on public.schedule_assignments for insert to anon with check (true);
create policy "Allow browser update assignments" on public.schedule_assignments for update to anon using (true) with check (true);
create policy "Allow browser delete assignments" on public.schedule_assignments for delete to anon using (true);

-- schedule_assignment_crew
create policy "Allow browser read assignment crew"  on public.schedule_assignment_crew for select to anon using (true);
create policy "Allow browser insert assignment crew" on public.schedule_assignment_crew for insert to anon with check (true);
create policy "Allow browser update assignment crew" on public.schedule_assignment_crew for update to anon using (true) with check (true);
create policy "Allow browser delete assignment crew" on public.schedule_assignment_crew for delete to anon using (true);

-- Restore the anon grant on the quote-id generator.
grant execute on function public.next_quote_id(text) to anon;