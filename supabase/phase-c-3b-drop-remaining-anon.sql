-- ============================================================================
-- Phase C, step C3b: drop ALL remaining `anon` policies in the public schema.
--
-- Why this exists: the first C3 pass (phase-c-3-drop-anon-policies.sql) dropped
-- the anon policies by name, but 14 of them survived because their actual
-- names in the database didn't match the names the README documented (the
-- pricing tables use their specific table name in the policy name, and
-- app_settings uses "app_settings" not "settings"). `drop policy if exists`
-- with a non-matching name is a silent no-op, so they were left behind.
--
-- This script doesn't guess names. It reads the database's own policy list
-- (pg_policies) and drops every policy whose role list contains `anon`, in the
-- public schema. That is exactly the set we want gone — C1 added only
-- `to authenticated` policies, so no anon policy should remain. Safe to re-run
-- (idempotent: it loops over whatever anon policies still exist).
--
-- Run this, then re-run the verification query at the bottom to confirm zero
-- {anon} rows.
-- ============================================================================

do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'anon' = any(roles)
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end
$$;

-- Re-state the revoke (already done in C3, but harmless to repeat) so the
-- quote-id generator is not callable by anon either.
revoke execute on function public.next_quote_id(text) from anon;

-- ============================================================================
-- Verification (run separately after): should return ZERO rows.
--   select tablename, policyname, roles, cmd
--   from pg_policies
--   where schemaname = 'public' and 'anon' = any(roles)
--   order by tablename, policyname;
-- ============================================================================