-- ============================================================================
-- One-off fix: merge two customer records into "Sam Morgan".
--
-- The backfill created one customer per dedupe key (lowercased email, else
-- lowercased name). For a husband/wife team it made two records because the two
-- quotes carried different contact emails. This script folds the wife's record
-- into Sam Morgan's: re-links her quotes to Sam, appends her email onto Sam's
-- emails array (so both contacts live on one customer, which is what the
-- multi-email feature is for), then deletes her now-empty record.
--
-- The quote snapshots are NOT touched: each quote keeps the client_email it was
-- saved with (point-in-time stable). Only the customer_id link moves.
--
-- HOW TO RUN:
--   1. Run the discovery SELECT at the bottom first (it is commented out) to
--      read off Sam Morgan's id and the wife's id.
--   2. Paste those two ids into KEEPER_ID and GONER_ID below.
--   3. Run the DO block. It prints a summary at the end.
--
-- Safe to re-run: a second run is a no-op (the goner row is already gone, and
-- re-running the email merge just re-union-dedupes the same array).
-- ============================================================================

do $$
declare
  -- KEEPER = Sam Morgan (the record to keep).
  -- GONER  = Diane's record (the one to merge away and delete).
  keeper_id uuid := 'de7e005c-6323-4d18-8bca-1878d3247a47';  -- Sam Morgan
  goner_id  uuid := '7dffc8ea-1320-447f-b7b2-b68b034fa923';   -- Diane

  keeper_name text;
  goner_name  text;
  keeper_emails jsonb;
  goner_emails  jsonb;
  moved_quotes int;
  merged_emails jsonb;
begin
  if keeper_id = goner_id then
    raise exception 'keeper_id and goner_id are the same; nothing to merge.';
  end if;

  -- Sanity: both rows must exist.
  select name, emails into keeper_name, keeper_emails
    from public.customers where id = keeper_id;
  if not found then
    raise exception 'No customer found for keeper_id = %', keeper_id;
  end if;

  select name, emails into goner_name, goner_emails
    from public.customers where id = goner_id;
  if not found then
    raise exception 'No customer found for goner_id = %', goner_id;
  end if;

  -- 1) Re-link the wife's quotes to Sam Morgan.
  update public.quotes
     set customer_id = keeper_id
   where customer_id = goner_id;
  get diagnostics moved_quotes = row_count;

  -- 2) Append the wife's email(s) onto Sam's emails array, deduped by the
  --    email text so a shared address isn't listed twice. Sam's existing
  --    emails keep their order and the primary (first) email stays primary.
  select coalesce(
    ( select jsonb_agg(x order by ord) from (
        select e as x, 0 as ord
          from jsonb_array_elements(keeper_emails) as e
        union all
        select e as x, 1 as ord
          from jsonb_array_elements(goner_emails) as e
         where e->>'email' not in (
                 select e2->>'email'
                   from jsonb_array_elements(keeper_emails) as e2
               )
      ) s ),
    keeper_emails
  ) into merged_emails;

  update public.customers
     set emails = merged_emails,
         updated_at = now()
   where id = keeper_id;

  -- 3) Delete the wife's record. Its quotes already moved in step 1, and the
  --    FK is on delete set null, so even a missed row would just be unlinked
  --    rather than block the delete.
  delete from public.customers where id = goner_id;

  raise notice 'Merged "%" into "%". Quotes re-linked: %. Sam Morgan emails now: %.',
    goner_name, keeper_name, moved_quotes, merged_emails;
end $$;

-- ============================================================================
-- Discovery (run this FIRST to get the two ids, then paste them above).
-- This lists every customer with their linked-quote count, so you can pick out
-- Sam Morgan (the keeper) and the wife's row (the goner).
-- ============================================================================

-- select c.id,
--        c.name,
--        c.emails,
--        count(q.id) as quote_count
--   from public.customers c
--   left join public.quotes q on q.customer_id = c.id
--  group by c.id, c.name, c.emails
--  order by c.name;