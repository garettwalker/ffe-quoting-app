-- ============================================================================
-- customers table + quotes.customer_id + one-time backfill.
--
-- Customers are first-class, re-used records linked from quotes. A quote keeps
-- its own client_name / client_email snapshot (so PDFs, the pay page, and Stripe
-- checkout stay point-in-time stable); customer_id is just the link to the
-- shared record used for autofill and the repository view.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (create table if not
-- exists; policies drop-if-exists first; inserts on conflict do nothing). The
-- Supabase editor warns "table created without RLS" on the CREATE statement;
-- that advisory is per-statement and is satisfied by the ENABLE ROW LEVEL
-- SECURITY line plus the admin-only policies below it. Proceed past it.
-- ============================================================================

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emails jsonb not null default '[]'::jsonb,   -- [{ email, label? }]  (label e.g. "Sam", "Jane")
  phone text,                                   -- optional
  note text,                                    -- optional
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_name_idx on public.customers(lower(name));

alter table public.customers enable row level security;

-- Admin-only CRUD (mirrors payments-table.sql). Public.is_admin() is the
-- security-definer role check; anon/authenticated non-admins get nothing.
drop policy if exists "admin select customers" on public.customers;
drop policy if exists "admin insert customers" on public.customers;
drop policy if exists "admin update customers" on public.customers;
drop policy if exists "admin delete customers" on public.customers;
create policy "admin select customers" on public.customers for select to authenticated using (public.is_admin());
create policy "admin insert customers" on public.customers for insert to authenticated with check (public.is_admin());
create policy "admin update customers" on public.customers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete customers" on public.customers for delete to authenticated using (public.is_admin());

-- Link quotes to customers. on delete set null keeps the quote's client_name
-- / client_email snapshot intact if a customer row is ever removed.
alter table public.quotes add column if not exists customer_id uuid references public.customers(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Backfill: one customer per dedupe key (lowercased email when present, else
-- lowercased name). Best-effort: two no-email builders with the same name
-- collapse into one customer (a merge/split tool is future).
-- ---------------------------------------------------------------------------
with ranked as (
  select client_name, client_email, created_at,
    coalesce(nullif(trim(lower(client_email)), ''), 'name:' || trim(lower(client_name))) as k
  from public.quotes
),
first as ( select distinct on (k) client_name, client_email, k from ranked order by k, created_at asc )
insert into public.customers (name, emails)
select client_name,
  case when nullif(trim(client_email), '') is null then '[]'::jsonb
       else jsonb_build_array(jsonb_build_object('email', trim(client_email))) end
from first
on conflict do nothing;

-- 1. Link quotes that have an email to the customer whose emails include it.
update public.quotes q set customer_id = c.id
from public.customers c
where nullif(trim(q.client_email), '') is not null
  and exists (
    select 1 from jsonb_array_elements(c.emails) as e
    where lower(trim(e->>'email')) = lower(trim(q.client_email))
  );

-- 2. Link remaining unlinked quotes by lowercased name.
update public.quotes q set customer_id = c.id
from public.customers c
where q.customer_id is null
  and lower(trim(q.client_name)) = lower(trim(c.name));