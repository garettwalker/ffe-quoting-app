-- ============================================================================
-- Stripe webhook idempotency + payment-intent uniqueness (Stripe step 3).
--
-- Two things:
--   1. stripe_webhook_events: an audit log of every Stripe event we've
--      processed, keyed by Stripe's event id. The webhook handler records each
--      event after processing it, so retries / replays are visible and we never
--      lose track of what came in. (The handler's writes are themselves
--      idempotent, so this log is observability + defense, not the only guard.)
--   2. A unique index on payments.stripe_payment_intent_id so multiple webhook
--      events for one payment (processing -> succeeded -> refunded) update a
--      single ledger row instead of creating duplicates. Postgres treats NULLs
--      as distinct, so manual payments (NULL intent id) are unaffected.
--
-- Run once in the Supabase SQL Editor. Safe to re-run. Assumes the `payments`
--      table from step 1 already exists.
-- ============================================================================

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_processed_idx
  on public.stripe_webhook_events(processed_at desc);

alter table public.stripe_webhook_events enable row level security;
-- Admin can inspect the log; the webhook writes via the service-role client
-- (bypasses RLS), so no insert policy is needed.
drop policy if exists "admin select stripe webhook events" on public.stripe_webhook_events;
create policy "admin select stripe webhook events"
  on public.stripe_webhook_events for select to authenticated
  using (public.is_admin());

-- One ledger row per Stripe payment intent (NULLs are distinct, so manual
-- payments with no intent id are unaffected).
create unique index if not exists payments_stripe_intent_uniq
  on public.payments(stripe_payment_intent_id);