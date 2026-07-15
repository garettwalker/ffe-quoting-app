-- ============================================================================
-- payments table: the real payment ledger for invoices.
--
-- Both the manual "Mark Paid" button (method = 'manual', written by the admin
-- via the authenticated browser client) and the Stripe webhook (method =
-- 'card' / 'ach_debit', written by the service-role client which bypasses RLS)
-- insert rows here. The per-invoice `status` flag in quotes.invoice_data remains
-- the UI source of truth for now; this table is the audit ledger of actual
-- money received. A future pass can derive "paid in full" from this ledger
-- instead of the flag.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (create table if not
-- exists; policies are drop-if-exists first).
-- ============================================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete cascade,
  invoice_kind text not null check (invoice_kind in ('initial','finish')),
  amount_cents integer not null check (amount_cents >= 0),
  method text not null check (method in ('card','ach_debit','manual')),
  status text not null default 'succeeded' check (status in ('pending','processing','succeeded','failed','refunded')),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_session_id text,
  recorded_by text,                       -- admin email for manual; 'stripe' for webhook
  paid_at timestamptz,                     -- when funds were confirmed (succeeded)
  created_at timestamptz not null default now()
);

create index if not exists payments_quote_idx on public.payments(quote_id);
create index if not exists payments_intent_idx on public.payments(stripe_payment_intent_id);

alter table public.payments enable row level security;

-- Admin-only CRUD. The Stripe webhook writes via the service-role client, which
-- bypasses RLS, so it needs no policy here.
drop policy if exists "admin select payments" on public.payments;
drop policy if exists "admin insert payments" on public.payments;
drop policy if exists "admin update payments" on public.payments;
drop policy if exists "admin delete payments" on public.payments;
create policy "admin select payments" on public.payments for select to authenticated using (public.is_admin());
create policy "admin insert payments" on public.payments for insert to authenticated with check (public.is_admin());
create policy "admin update payments" on public.payments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete payments" on public.payments for delete to authenticated using (public.is_admin());