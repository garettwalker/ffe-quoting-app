-- ============================================================================
-- base_rates table: the named per-square-foot base-rate presets the owner picks
-- from in the quote builder (e.g. "Standard - $6.00", "Big complex / all-in -
-- $8.00"). Replaces the old hardcoded base-pricing-mode + high-ceiling auto
-- logic. The quote stores the chosen rate CENTS directly as a snapshot
-- (quote_data.baseRateCents), so editing a preset later does NOT move
-- already-saved quotes.
--
-- Safe to RE-RUN: create table if not exists, insert ... on conflict do nothing.
-- Run this in the Supabase SQL Editor as the owner. After it runs, the builder's
-- Base Rate dropdown populates from this table and the Pricing Admin page gets a
-- "Base Rates" editor section.
--
-- RLS mirrors pricing_levels: admin-only writes (public.is_admin() from
-- phase-c-1-add-policies.sql), any authenticated user can read (the builder
-- server component reads the catalog on behalf of the logged-in user).
-- ============================================================================

create table if not exists public.base_rates (
  id text primary key,
  name text not null,
  rate_cents integer not null default 600,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.base_rates enable row level security;

-- Admin-only writes; any authenticated user can read.
drop policy if exists "admin select base_rates" on public.base_rates;
drop policy if exists "admin insert base_rates" on public.base_rates;
drop policy if exists "admin update base_rates" on public.base_rates;
create policy "admin select base_rates" on public.base_rates for select to authenticated using (true);
create policy "admin insert base_rates" on public.base_rates for insert to authenticated with check (public.is_admin());
create policy "admin update base_rates" on public.base_rates for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed the $5 through $12 presets the owner asked for. Ids are stable slugs so
-- the builder can recognize a chosen preset across renames; sort_order ascends
-- by rate. Re-running is a no-op because of on conflict do nothing.
insert into public.base_rates (id, name, rate_cents, active, sort_order) values
  ('base-rate-5',  'Economy / simple',         500,  true, 0),
  ('base-rate-6',  'Standard',                 600,  true, 1),
  ('base-rate-7',  'Upgraded',                 700,  true, 2),
  ('base-rate-8',  'Big complex / all-in',     800,  true, 3),
  ('base-rate-9',  'Large complex',            900,  true, 4),
  ('base-rate-10', 'Premium',                 1000,  true, 5),
  ('base-rate-11', 'High-end',                1100,  true, 6),
  ('base-rate-12', 'Luxury / custom',         1200,  true, 7)
on conflict (id) do nothing;