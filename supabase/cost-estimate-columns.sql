-- Internal project cost estimator + P&L (added 2026-08-15).
--
-- Two new JSONB columns. No new tables, no new RLS policies — the existing
-- admin-only policies on `quotes` and `app_settings` (see phase-c-1-add-policies.sql)
-- already cover these columns.
--
-- Run ONCE in the Supabase SQL Editor. Both statements are idempotent
-- (`add column if not exists`), so re-running is harmless.

-- Per-job cost estimate state (wire / devices / adders % / labor). Nullable:
-- old quotes predate the field and stay null (the P&L view builds a default
-- estimate from the quote's sqft on first open, and nothing is persisted
-- until the owner saves).
alter table public.quotes
  add column if not exists cost_estimate_data jsonb;

-- Global cost-estimate defaults the owner edits in Pricing Admin (wire cost
-- per roll, roll lengths, the feet-per-sqft heuristic ratios, default adder
-- %, default hourly labor rate). Defaults to an empty object; the app falls
-- back to built-in defaults (Chad's numbers, in lib/cost-estimate.ts) when
-- this is empty/null, and the Pricing Admin editor seeds from those built-in
-- defaults on first open.
alter table public.app_settings
  add column if not exists cost_estimate_defaults jsonb not null default '{}'::jsonb;