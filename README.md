# Freedom Family Electric — Quoting App

A standalone web quoting application for **Freedom Family Electric**, replacing an older Google Sheets + Apps Script quote system. Built for the owner to create, review, save, and eventually export electrical quotes for residential work (new builds, custom/spec homes, large homes, service and remodel).

This README is the long-term context file for the project. It is meant for both the owner and any AI coding assistant picking the project up later. Keep the **Recent work** section updated as things change.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres) for saved quote storage
- Vercel for deployment (auto-deploys from `main` on GitHub)

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Overview dashboard. Landing hub with quick actions (Start New Quote, Receivables, Manage Pricing), summary tiles (active quotes, awaiting payment + outstanding $, paid in full, pricing), an unsaved-working-copy resume card, and the 5 most recent quotes. Links into each tool. |
| `/quotes` | The quoting tool. Full five-stage lifecycle pipeline (Draft, Prepared, Client Accepted, Pending Payments, Paid in Full) reading saved quotes from Supabase. |
| `/quotes/new` | Quote builder. Starts a fresh quote or resumes the active browser working copy. |
| `/quotes/review` | Review the completed quote before saving. Reads the active working copy from browser storage. |
| `/quotes/[id]` | View a saved quote loaded from Supabase by database id. Does not use browser storage. |
| `/quotes/[id]/edit` | Edit a saved quote. Loads it from Supabase into the builder; saving updates the existing row. |
| `/quotes/[id]/print` | Printable Detailed Quote page (customer-facing). One-click **Download PDF** (rendered server-side with react-pdf); the on-screen layout is a preview of the PDF. |
| `/quotes/[id]/print/pdf` | Server route: renders the Detailed Quote to a PDF buffer (react-pdf) and streams it back as a file download. |
| `/quotes/[id]/summary` | Printable Summary Quote page (customer-facing). Condensed: one subtotal per pricing category plus the quote total, no unit prices. One-click Download PDF; on-screen layout is a preview. |
| `/quotes/[id]/summary/pdf` | Server route: renders the Summary Quote to a PDF buffer and streams it back as a file download. |
| `/quotes/[id]/invoices` | Invoicing page for an accepted quote. Set contract amount, rough-in/finish split, and permit fee; mark invoices paid; download invoice PDFs. |
| `/quotes/[id]/invoices/[kind]/print` | Printable invoice (`kind` = `initial` or `finish`). One-click Download PDF; on-screen layout is a preview. |
| `/quotes/[id]/invoices/[kind]/pdf` | Server route: renders the invoice (`initial` or `finish`) to a PDF buffer and streams it back as a file download. |
| `/pricing-admin` | Pricing admin. Edit line items, pricing levels, contingencies, project types, crew, and business info/quote notes/invoice terms stored in Supabase. Deactivate-only (no hard delete). |
| `/schedule` | Schedule. Owner-only week view of the crew's jobs: phone-first day list (7-column grid on desktop), Prev/Today/Next week nav, tap a day to add, tap a card to edit. Entries are either a quote job (rough-in/finish for an accepted quote, title/location auto-filled from the quote) or a free-form service call. Optional clock times, default all-day. Times + a soft overlap warning. Employee self-service access is deferred to the auth pass. |
| `/receivables` | Accounts Receivable. Two stacked tables — Pending Payments (outstanding balances) and Historical Paid (paid in full) — one row per job with rough-in and finish invoice columns. Preset period filter + sort. Read-only, derived from `quotes.invoice_data`. |

## File structure

```
app
  globals.css
  layout.tsx
  page.tsx                      // Overview dashboard (hub)
  quotes
    page.tsx                    // Quote lifecycle pipeline (5 stages)
    new/page.tsx                // Builder page
    review/page.tsx             // Review + save
    [id]/page.tsx               // Saved quote view
    [id]/edit/page.tsx          // Saved quote editor
    [id]/print/page.tsx         // Printable Detailed Quote (preview + Download PDF link)
    [id]/print/pdf/route.tsx    // Server route: renders the Detailed Quote to a PDF buffer (react-pdf)
    [id]/summary/page.tsx       // Printable Summary Quote (category subtotals, preview + Download PDF)
    [id]/summary/pdf/route.tsx  // Server route: renders the Summary Quote to a PDF buffer
    [id]/invoices/page.tsx      // Invoicing setup + invoice list
    [id]/invoices/[kind]/print/page.tsx  // Printable invoice (initial/finish, preview + Download PDF)
    [id]/invoices/[kind]/pdf/route.tsx   // Server route: renders the invoice to a PDF buffer
  pricing-admin/page.tsx       // Pricing admin (items, levels, contingencies, project types, crew, settings)
  receivables/page.tsx         // Accounts Receivable (pending vs paid, two tables)
  schedule/page.tsx            // Schedule (owner-only week view; phone day list / desktop 7-col grid)

components
  app-shell.tsx
  dashboard-active-quote.tsx     // slim resume card for unsaved working copies
  dashboard-quote-section.tsx   // one pipeline stage (Draft / Prepared / Client Accepted)
  status-badge.tsx              // draft/prepared/accepted + invoice paid/unpaid badges
  quote-status-button.tsx       // client button that updates quote.status then refreshes
  quote-builder.tsx
  quote-line-item-picker.tsx
  quote-totals-panel.tsx
  delete-quote-button.tsx
  formatted-number-input.tsx    // currency/decimal input used by the builder + invoice setup
  invoice-builder.tsx           // invoice setup form (contract, split, permit)
  invoice-paid-button.tsx       // toggles an invoice paid/unpaid
  receivables-table.tsx         // AR tables: period/sort + pending vs paid partition
  schedule-board.tsx            // client week board: week nav, day list/grid, add/edit modal
  schedule-assignment-form.tsx  // client add/edit form (Quote job vs Service call, times, overlap warning)
  crew-editor.tsx               // admin editor for the crew list (add/rename/color/active)
  pricing-admin-ui.tsx          // shared Field/buttons/badges for the admin editors
  pricing-item-editor.tsx       // admin editor for pricing_items
  pricing-level-editor.tsx      // admin editor for pricing_levels
  contingency-editor.tsx       // admin editor for contingency_options
  project-type-editor.tsx      // admin editor for project_types
  settings-editor.tsx           // admin editor for the single app_settings row
  pdf/
    download-pdf-button.tsx     // plain link to the server PDF route + back link (no client-side react-pdf)
    detailed-quote-document.tsx // react-pdf <Document> recreation of the Detailed Quote printable
    summary-quote-document.tsx  // react-pdf <Document> recreation of the Summary Quote printable
    invoice-document.tsx        // react-pdf <Document> recreation of the printable invoice (initial/finish)
    pdf-shared.tsx              // shared colors/styles/header/footer/total/notes/list building blocks for the PDFs

lib
  calculations.ts
  currency.ts
  detailed-quote-pdf.ts         // server: loads quote snapshot + settings, builds the Detailed Quote PDF props
  summary-quote-pdf.ts          // server: loads quote snapshot + settings, builds the Summary Quote PDF props
  invoice-pdf.ts                // server: loads quote row + invoice setup + settings, builds the invoice PDF props
  invoice-calculations.ts       // invoice amount math + outstanding balance
  pdf-logo.ts                   // server-only: reads /public/ffe-logo.png into a base64 data URI for react-pdf
  pricing.ts                    // server-side reads of the live pricing catalog + settings
  quote-id.ts                   // resolveQuoteIdForSave: keep a custom id or ask the server for the next atomic daily number
  schedule.ts                   // crew + schedule assignment types, server fetchers, time/phase/overlap helpers
  quote-storage.ts
  supabase.ts
  types.ts

public
  ffe-logo.png
```

## How the quote flow works

1. **Dashboard** (`/`) — the overview hub. Owner starts a new quote, jumps to receivables or pricing, or picks a recent quote. The full quote list lives at **`/quotes`** (the quoting tool / lifecycle pipeline), where the owner also opens saved quotes from history.
2. **Build** (`/quotes/new`) — enter project and client info, pricing setup, adders, internal notes. The builder keeps a temporary working copy in the browser (`localStorage` key `ffe-active-quote`) so work is not lost when moving between builder and review. This working copy is **cleared once the quote is saved to Supabase**; after that the owner works from the saved record. The active quote is purely a pre-save working copy. To abandon an unsaved working copy, use the builder's **Reset Quote** button.
3. **Complete Quote** — validates required fields, saves the working copy, routes to `/quotes/review`.
4. **Review** (`/quotes/review`) — review the customer-facing summary and final total, then save.
5. **Save Quote** — writes to Supabase. If editing a saved quote, it **updates** the existing row; otherwise it **inserts** a new row and remembers the id (in memory) so the View/Edit links work. The button locks after a successful save. **After saving, the browser working copy (active quote) is cleared**, so the owner works from the saved file going forward instead of the temporary form. The review page still shows the success message and links from in-memory state.
6. **Saved quote** (`/quotes/[id]`) — view, edit, or delete the saved quote. From here on, the owner works from the saved file, not the active quote.

### Internal notes (owner only)
The builder has an "Internal Notes" text box. These notes are saved with the quote and shown on the owner views (review and saved quote pages), clearly labeled as not shown to the customer. They are **not** included in customer-facing output, including the customer-facing PDFs (Detailed Quote, Summary Quote, and invoices), which load only the safe fields from the saved snapshot.

### Deleting quotes
The saved quote page has a Delete Quote button with a confirm step. It removes the row from Supabase. This requires a delete RLS policy (see Supabase setup below).

### Quote lifecycle pipeline
Every saved quote has a row-level `status` of `draft`, `prepared`, or `accepted`. The `/quotes` pipeline groups saved quotes into five stacked stages that tell the whole customer life cycle: **Draft** (still being worked on), **Prepared** (ready to share with the client, or edit before sending), **Client Accepted** (billing and invoicing start here), **Pending Payments** (invoices set up, money still outstanding), and **Paid in Full** (every invoice paid). The overview dashboard (`/`) rolls these up into summary tiles (active quotes, awaiting payment, paid in full) with quick links into each tool.

- **Save as draft** (in the builder) writes a `draft` row to Supabase with only a client name required, so work-in-progress is saved cross-device instead of only in the browser. The browser working copy is cleared once the draft is saved.
- **Complete Quote** then **Prepare** (on the review page) writes/updates the row as `prepared` and is the customer-ready state.
- **Mark accepted** moves a prepared quote to `accepted`. An accepted quote with no invoices yet shows in **Client Accepted**.
- Once invoices are set up on an accepted quote, it automatically moves to **Pending Payments** (no button to click).
- When every invoice on the quote is marked paid, it automatically moves to **Paid in Full** (no button to click).

The last two stages are not stored on the row. They are derived on the fly from the row status plus `invoice_data` by `lifecycleStage()` in `lib/invoice-calculations.ts`: accepted + no invoice setup = Client Accepted; accepted + invoices with an outstanding balance = Pending Payments; accepted + all invoices paid = Paid in Full. Because it is derived, the pipeline and dashboard always reflect the real payment state and can never disagree with the invoice records.

Status changes (draft/prepared/accepted) are made by `QuoteStatusButton`, a small client component that runs `supabase.update({status})` then `router.refresh()`. Because the pipeline query lives in the server component `app/quotes/page.tsx` (and the overview query lives in `app/page.tsx`), the refresh re-runs it and the quote moves between stages without a manual reload. The same pattern powers the status-aware actions on the saved-quote page. `StatusBadge` now shows the derived lifecycle stage (Draft, Prepared, Accepted, Pending Payments, Paid in Full) rather than just the raw status.

**One-time SQL migration (run in the Supabase SQL Editor before deploying this change):**
```sql
update quotes set status = 'prepared' where status = 'completed';
```
This moves every previously saved quote (all stamped `completed`) into the Prepared section so nothing is orphaned.

### Invoicing (accepted quotes)
When a quote is Client Accepted, the saved-quote page and the `/quotes` Accepted card show an **Invoicing** link to `/quotes/[id]/invoices`. There the owner sets up invoicing:

- **Contract amount** defaults to the accepted quote total and is editable.
- **Rough-in / finish split** defaults to 50/50 and is editable. A warning appears if the two percentages do not total 100%.
- **Permit fee** is entered as a dollar amount and shown as its own line on the initial invoice.
- Two invoices are generated: the **initial invoice** (rough-in amount + permit fee) and the **finish invoice** (the remainder).
- Each invoice can be marked **paid / unpaid**. The `/quotes` Accepted card, the overview "Awaiting payment" tile, and the invoicing page show the outstanding balance or "paid in full."
- Each invoice has a printable page (`/quotes/[id]/invoices/[kind]/print`, kind = `initial` or `finish`) with one-click Download PDF; the on-screen layout is a preview of the PDF. Invoice references are `{quote_id}-R` (initial/rough-in) and `{quote_id}-F` (finish).

Invoice setup is stored as JSONB in the `quotes.invoice_data` column (null until set up). Saving invoice setup preserves existing paid statuses by invoice kind. Invoicing math lives in `lib/invoice-calculations.ts`.

**One-time SQL (run in the Supabase SQL Editor before deploying invoicing):**
```sql
alter table public.quotes add column if not exists invoice_data jsonb;
```
No new RLS policies are needed; the existing anon select/update policies cover the column.

### Accounts Receivable (`/receivables`)
A read-only collections page that shows every accepted quote with invoice setup, split into **two stacked tables**: **Pending Payments** (any job with an outstanding balance, including partially-paid jobs) and **Historical Paid** (jobs paid in full — a job moves here automatically once its last unpaid invoice is marked paid). Each row is one job (customer) with separate **Rough-In** and **Finish** columns showing that invoice's amount, a Paid/Unpaid badge, and the per-invoice outstanding (or the paid date), plus a job-level **Total Outstanding** and the earliest invoice issued date. Row links go to the existing invoicing page (`/quotes/[id]/invoices`) where invoice PDFs are downloaded or invoices marked paid.

Controls live client-side in `components/receivables-table.tsx`: a preset period filter (All time / This month / Last 30 days / This quarter / This year, scoped by the job's earliest invoice issued date) and a sort (oldest first / largest outstanding / newest / client). The page (`app/receivables/page.tsx`, `force-dynamic`) queries accepted quotes with `invoice_data` not null, flattens each into a `ReceivableJob` (reusing `outstandingCents`, `isFullyPaid`, `computeInvoiceAmounts`, `invoiceReference`, plus `invoiceOutstandingCents` for per-invoice balances), and hands them to the table. No new tables or RLS policies. Summary cards at the top show total invoiced, total outstanding (emphasized), and total paid.

## Pricing and calculation logic

Pricing and customer-facing text now live in Supabase (not a static file) and are edited through the `/pricing-admin` page. The two builder entry points (`/quotes/new` and `/quotes/[id]/edit`) are async server components that call `getPricingCatalog()` in `lib/pricing.ts` and pass the catalog down into `<QuoteBuilder>`, which threads the items into the picker and the levels/contingencies into `calculateQuote`. The printable Detailed Quote, Summary Quote, and invoice pages call `getSettings()` for business name/email, default quote notes, and invoice payment terms. All of these read live on every request (`force-dynamic` + the shared client's `cache: "no-store"`), so a price change in `/pricing-admin` shows up the next time a quote is started or a printable is opened.

Calculations live in `lib/calculations.ts`. Money is stored in cents; `lib/currency.ts` formats it. The catalog types (`PricingItem`, `PricingLevel`, `ContingencyOption`, `ProjectType`, `AppSettings`, `PricingCatalog`) are in `lib/types.ts`.

Base rate (evaluated in order):
- Manual mode = manual base rate
- Builder/Spec = $5.00 / sq ft
- Small home under 2,500 sq ft = $7.00 / sq ft
- High Ceiling / Complex Switching = $6.50 / sq ft
- Default = $6.00 / sq ft

Pricing levels and contingency options are multiplier rows in Supabase (edited in `/pricing-admin`). The seeded defaults are: levels Contractor/Builder 0.90, Standard/Custom 1.00, Premium/High-End 1.20; contingencies 0% / 5% / 10% / 15% (1.00 / 1.05 / 1.10 / 1.15). Project types default to Custom Home, Spec Home, New Build, Remodel, Service Work.

Calculation:
```
base package        = square footage * base rate
adders base total   = sum(quantity * base price)
total before client = base package + adders base total
combined multiplier = pricing level multiplier * contingency multiplier
final quote         = total before client * combined multiplier
```

`calculateQuote` resolves the pricing level and contingency by stable id, falling back to an explicit default id (not array index) so reordering or deactivating rows never silently changes a quote. The builder dropdowns show rows where `active` is true **plus** the quote's currently-selected value, so editing an old quote that references a now-inactive level/item still resolves and displays it. Quotes store the project-type **display name** (not the row id) for backward compatibility with existing saved quotes.

Pricing rows are deactivated, never hard-deleted, so old quotes and drafts keep resolving. Saved quotes already store full `quote_data` and `calculation_data` JSONB snapshots, which protects historical pricing: only the live builder re-resolves pricing; saved views and printables always render from the snapshot.

**One-time SQL (run in the Supabase SQL Editor before deploying pricing admin):**
```sql
create table if not exists public.pricing_items (
  id text primary key,
  category text not null,
  name text not null,
  unit_type text not null,
  base_price_cents integer not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_levels (
  id text primary key,
  name text not null,
  multiplier numeric not null default 1,
  description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.contingency_options (
  id text primary key,
  name text not null,
  multiplier numeric not null default 1,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_types (
  id text primary key,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id integer primary key default 1,
  business_name text not null default '',
  business_email text not null default '',
  business_tagline text not null default '',
  default_quote_notes text not null default '',
  invoice_payment_terms text not null default '',
  updated_at timestamptz not null default now()
);
```
Then seed the five tables from the current values (the 41 pricing items, 3 levels, 4 contingencies, 5 project types, and the business info / default quote notes / invoice payment terms that used to live in `lib/seed-data.ts`). Enable RLS and add permissive anon policies per table (mirroring the `quotes` policies) for the build phase:
```sql
alter table public.pricing_items       enable row level security;
alter table public.pricing_levels      enable row level security;
alter table public.contingency_options enable row level security;
alter table public.project_types       enable row level security;
alter table public.app_settings        enable row level security;

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
create policy "Allow browser insert settings during app build" on public.app_settings       for insert to anon with check (true);
create policy "Allow browser read settings during app build"  on public.app_settings        for select to anon using (true);
create policy "Allow browser update settings during app build" on public.app_settings       for update to anon using (true) with check (true);
```
If the migration is skipped, the builder shows an empty picker plus a "Pricing not configured" banner, and print pages show empty business info. No new policies are needed beyond these dev-permissive anon ones; they must be tightened (and `/pricing-admin` gated to admin) alongside the existing RLS-tightening item before production.

## Supabase setup

Environment variables (set in Vercel, and in `.env.local` for local dev):
```
NEXT_PUBLIC_SUPABASE_URL           // base project URL, e.g. https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
The Supabase URL is the base project URL, **not** the REST endpoint.

`quotes` table:
```sql
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_id text not null,
  quote_date date not null,
  client_name text not null,
  client_email text,
  project_street text not null,
  project_city text not null,
  project_state text not null,
  project_zip text not null,
  project_type text not null,
  square_footage integer not null,
  base_pricing_mode text not null,
  manual_base_rate_cents integer not null,
  high_ceiling_or_complex_switching boolean not null default false,
  pricing_level_id text not null,
  contingency_id text not null,
  internal_notes text,
  quote_data jsonb not null,
  calculation_data jsonb not null,
  client_quote_total_cents integer not null,
  status text not null default 'draft',
  invoice_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`quote_id` is unique per quote. The server-side sequence guarantees no two auto-generated IDs collide, but the owner can type a custom ID (used as-is, without advancing the counter), so a custom ID that happens to match a past or future `Q-YYYYMMDD-NNN` could otherwise produce a duplicate row. A unique constraint is the database-level guard. Run once in the Supabase SQL Editor — first confirm there are no existing duplicates, then add the constraint:
```sql
-- 1. Confirm there are no duplicate quote_ids (must return 0 rows):
select quote_id, count(*)
from public.quotes
group by quote_id
having count(*) > 1;

-- 2. Add the unique constraint (only if step 1 returned nothing):
alter table public.quotes
  add constraint quotes_quote_id_key unique (quote_id);
```
If step 1 ever returns rows, resolve the duplicates (edit or delete the wrong row) before adding the constraint, or the `alter table` will fail. Once the constraint exists, a colliding insert/update throws and the app surfaces it as a "Save failed" error (the save paths in `quote-builder.tsx` and `review/page.tsx` already report insert errors).

The quote ID is a daily sequence (`Q-YYYYMMDD-NNN`) assigned at save time via a Postgres function that atomically increments a per-day counter, so two people saving at the same instant can never collide. The builder leaves the Quote ID blank (placeholder "Assigned on save") until the quote is actually saved; the owner may type a custom ID, which is used as-is. Editing a saved quote keeps its existing ID (clearing the field on an edit does not mint a new number). The function is a `security definer` function that atomically increments the counter via `INSERT ... ON CONFLICT ... RETURNING` and returns the formatted ID. It bypasses RLS on the counter table, so the table itself has no policies (direct anon access is denied; only the function can touch it). Run once in the Supabase SQL Editor before deploying the sequencing:

Two honesty caveats on "server-side" and "no gaps": the RPC is invoked from the browser using the public anon key (the *increment* is atomic in Postgres, but the call is not an authenticated server action), so until auth/RLS tightening lands anyone with the anon key can call `next_quote_id` and burn arbitrary gaps; and the number is reserved before the quote row is written, so a save that fails after the increment (network error, RLS denial, constraint violation) can also leave a gap. Abandoned builder sessions (closed before Save) do not burn a number. Moving the call behind an authenticated server action is part of the pending hardening pass.
```sql
create table if not exists public.quote_sequences (
  day text primary key,        -- 'YYYYMMDD'
  seq integer not null default 0
);

alter table public.quote_sequences enable row level security;
-- No policies: direct anon access is denied. The security-definer function
-- below is the only path that can read/write the counter.

create or replace function public.next_quote_id(p_day text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day text;
  v_seq integer;
begin
  v_day := p_day;
  insert into public.quote_sequences (day, seq) values (v_day, 1)
    on conflict (day) do update set seq = public.quote_sequences.seq + 1
    returning seq into v_seq;
  return 'Q-' || v_day || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

grant execute on function public.next_quote_id(text) to anon;

-- Defensive default: a raw insert that omits status lands as draft, not the
-- legacy 'completed'. (Every app insert sets status explicitly, so this only
-- guards direct/SQL inserts.)
alter table public.quotes alter column status set default 'draft';
```
The day prefix is the quote's own `quote_date` (passed in as `p_day`), not the database `now()`, so a quote's ID prefix and its `quote_date` always agree even if the owner backdates the quote or saves a tab left open across midnight. The counter is keyed by that day, so two quotes sharing a `quote_date` get sequential numbers.

If you are upgrading from the earlier no-argument `next_quote_id()`, drop the old overload first and grant the new one (the parameter changes the function signature, so the old grant does not carry over):
```sql
drop function if exists public.next_quote_id();
grant execute on function public.next_quote_id(text) to anon;
```

RLS is enabled. Development policies (anon can insert, select, update, delete). These are intentionally permissive for the build phase and **must be tightened before production** (add auth, limit to owner/admin, move writes through server actions if possible). Current dev policies:
```sql
create policy "Allow browser insert quotes during app build" on public.quotes for insert to anon with check (true);
create policy "Allow browser read quotes during app build"   on public.quotes for select to anon using (true);
create policy "Allow browser update quotes during app build" on public.quotes for update to anon using (true) with check (true);
create policy "Allow browser delete quotes during app build" on public.quotes for delete to anon using (true);
```
The **update** policy is required for the status pipeline (`QuoteStatusButton`), saving drafts against an existing row, and editing saved quotes. If status changes fail in testing, verify the update policy exists.

### Scheduling (crew + assignments)

The owner schedules his crew (Adam, Johnathan full-time; Peyton intern) onto rough-in and finish jobs for accepted quotes, plus free-form entries (service calls, warranty visits, supply runs) that have no quote. `crew` is a small editable list (managed under Pricing → Crew; deactivate instead of delete so past schedules keep their label). `schedule_assignments` is one row per crew member per day: `quote_id` and `phase` are both optional (null = a free-form/service-call entry with no phase), and `title`/`location` are always stored on the row as an editable snapshot, so editing them never touches the quote and deleting a quote (`on delete set null`) never wipes schedule history. Only `crew_id` and `work_date` are required. Run once in the Supabase SQL Editor:
```sql
create table if not exists public.crew (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'full_time' check (role in ('full_time','intern')),
  color text not null default '#344236',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete set null,
  crew_id uuid not null references public.crew(id) on delete cascade,
  phase text check (phase in ('rough_in','finish')),
  title text not null default '',
  location text not null default '',
  work_date date not null,
  start_time time,
  end_time time,
  notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time)
);

create index if not exists schedule_assignments_work_date_idx on public.schedule_assignments(work_date);
create index if not exists schedule_assignments_crew_date_idx on public.schedule_assignments(crew_id, work_date);
create index if not exists schedule_assignments_quote_idx on public.schedule_assignments(quote_id);

alter table public.crew enable row level security;
alter table public.schedule_assignments enable row level security;

create policy "Allow browser read crew"  on public.crew for select to anon using (true);
create policy "Allow browser insert crew" on public.crew for insert to anon with check (true);
create policy "Allow browser update crew" on public.crew for update to anon using (true) with check (true);
create policy "Allow browser delete crew" on public.crew for delete to anon using (true);

create policy "Allow browser read assignments"  on public.schedule_assignments for select to anon using (true);
create policy "Allow browser insert assignments" on public.schedule_assignments for insert to anon with check (true);
create policy "Allow browser update assignments" on public.schedule_assignments for update to anon using (true) with check (true);
create policy "Allow browser delete assignments" on public.schedule_assignments for delete to anon using (true);
```
Seed the crew (or add them via Pricing → Crew):
```sql
insert into public.crew (name, role, color, active, sort_order) values
  ('Adam', 'full_time', '#344236', true, 0),
  ('Johnathan', 'full_time', '#a56543', true, 1),
  ('Peyton', 'intern', '#6e7751', true, 2)
on conflict do nothing;
```
These permissive anon policies mirror the rest of the dev posture and **must be tightened before production** (gate to owner/admin, scope employees to their own schedule) as part of the auth/RLS pass. Employee self-service access to the schedule is deferred until that pass; today the schedule is owner-only.

## Branding

- Logo: `public/ffe-logo.png` (use this one, not older circular badge logos).
- Business email: freedomfamilyelectric@gmail.com
- Color palette and Tailwind tokens (see `tailwind.config.ts`): pine, deep-pine, moss, sage, clay, sand, cream, stone, charcoal, whitewarm. Radii: `rounded-xl2`, `rounded-xl1`, `rounded-soft`. Shadows: `shadow-soft`, `shadow-card`. Headings use `font-display`.
- Design feel: warm, professional, clean, residential contractor, slightly premium, rounded cards and buttons, earthy palette.
- Writing style: clear, professional, no unnecessary jargon, **no em dashes** in app copy.

## Running locally

```bash
npm install
npm run dev
```
Open http://localhost:3000. You need the Supabase env vars in `.env.local`. Deployments happen automatically on push to `main` via Vercel.

## Working with the AI coding assistant

Preferences to follow when making changes:
- Small, step-by-step changes. Push to `main` directly (that is the deploy branch); do not open PRs unless asked.
- For complex files (`quote-builder.tsx`, `review/page.tsx`, `quote-line-item-picker.tsx`), prefer full-file replacements over patch snippets.
- Always give exact file paths, a clear commit message, and explicit desktop + phone test steps.
- Explain every change in plain English with a high-level summary (plan, what was done, how things changed) plus test steps.
- The owner verifies via the live Vercel deployment on phone and desktop.
- No em dashes in user-facing app copy.

## Current state

Done:
- Next.js app foundation, FFE branding shell
- Overview dashboard at `/` (hub): quick actions, summary tiles (active quotes, awaiting payment + outstanding $, paid in full, pricing), unsaved-working-copy resume card, and 5 recent quotes
- Quote lifecycle pipeline at `/quotes` (the quoting tool): five stacked stages (Draft / Prepared / Client Accepted / Pending Payments / Paid in Full) reading saved quotes from Supabase
- Quote builder with pricing calculation, adders, internal notes, and Save as draft
- Mobile layout
- Review page (Prepare writes a prepared quote)
- Active quote browser storage with edit-retains-values
- Supabase save (insert + update), duplicate-save prevention
- Saved quote view (`/quotes/[id]`) and edit (`/quotes/[id]/edit`)
- Delete quote from Supabase
- Owner-only internal notes (not shown to customer)
- Daily-sequence quote IDs assigned server-side at save time: a Postgres `next_quote_id()` function atomically hands out `Q-YYYYMMDD-NNN` (e.g. Q-20260618-001, -002, -003), so two people saving at once can never collide. The builder leaves the Quote ID blank (placeholder "Assigned on save") until the quote is saved; a custom ID typed by the owner is used as-is. The number is reserved only when the quote is actually saved, so abandoned builder sessions do not create gaps in client-facing IDs.
- Printable Detailed Quote page (`/quotes/[id]/print`) with one-click Download PDF (rendered server-side with react-pdf); the on-screen layout is a preview of the PDF
- Printable Summary Quote page (`/quotes/[id]/summary`) with one-click Download PDF. Condensed customer-facing version: one subtotal per pricing category plus the quote total, no unit prices. Category grouping via `summarizeByCategory` in `lib/calculations.ts`.
- Quote status pipeline: draft, prepared, accepted with manual stage buttons on the `/quotes` pipeline and saved-quote page
- Invoicing from accepted quotes: contract amount, 50/50 rough-in/finish split (editable), permit fee, two invoices (initial = rough-in + permit, finish = remainder), paid/unpaid tracking, printable invoices, outstanding balance on the dashboard
- Pricing admin (`/pricing-admin`): all pricing (line items, pricing levels, contingencies, project types) and business info / default quote notes / invoice payment terms moved out of the static `lib/seed-data.ts` file into Supabase tables, editable in the running app. Deactivate-only (no hard delete), editable sort order, active/inactive badges. Builder and print pages read live from Supabase via `lib/pricing.ts`.
- Accounts Receivable (`/receivables`): collections view over every accepted quote with invoice setup. Two stacked tables — Pending Payments (anything still outstanding) and Historical Paid (paid in full) — one row per job with separate rough-in and finish columns showing amount + paid/outstanding status, plus a job-level total outstanding. Preset period filter (All time / This month / Last 30 days / This quarter / This year) and sort (oldest first / largest outstanding / newest / client). Read-only, derived entirely from `quotes.invoice_data`; no new tables.
- PDF export upgrade: all four customer-facing printables (Detailed Quote, Summary Quote, Initial Invoice, Finish Invoice) download as a real PDF via one-click **Download PDF**, rendered server-side with `@react-pdf/renderer` (`renderToBuffer` streamed back as a file download). Each printable has a react-pdf `<Document>`, a server helper that loads the saved snapshot + live settings and builds pre-formatted props (single source of truth shared by the on-screen preview and the PDF route), and a `/pdf` server route. Shared header/info/total/notes/footer/list building blocks live in `components/pdf/pdf-shared.tsx`. The old browser-print buttons (`print-quote-button`, `invoice-print-button`) and the `.no-print` / `.print-document` print CSS have been removed. react-pdf is kept entirely out of the browser bundle (an earlier client-side attempt blanked the page on load).

Pending (rough priority):
- Optional: email the generated PDF to the client from the app (server-side send via an email provider; would need an API key in env and a verified sending domain). The PDF routes already render to a buffer server-side, so this is the natural next step on top of the completed PDF export work.
- Invoice enhancements: deposit invoice, more than two invoices, dedicated sequential invoice numbers, reset-paid button
- Owner/admin login (Supabase Auth), one owner + one builder/admin
- Access-level restriction: only admin may pull a quote back out of the invoicing lifecycle (the "Reopen as prepared" and "Move back to drafts" actions on Client Accepted / Pending Payments / Paid in Full quotes). Non-admin users can move quotes forward but not reopen an invoiced or paid quote. Gate the `QuoteStatusButton` instances that set `newStatus` to `prepared` or `draft` on an accepted quote (in `app/quotes/[id]/page.tsx` and `components/dashboard-quote-section.tsx`) behind an admin-role check once auth exists. Pairs with the RLS tightening item below.
- **Review this Pending list on every change** and remove (or mark complete) any item that has been accomplished, so the list stays accurate and does not drift.
- Tighten Supabase RLS for production (remove anon policies, add auth) — includes the five new pricing tables and `app_settings`; gate `/pricing-admin` to admin once auth exists. Blocked on the owner/admin login work: removing anon access before auth exists would lock the app out of its own data, so this waits until after auth.

## Recent work (history)

- 2026-06-22: Added a scheduling tool (Phase 1: phone-first week list). New `/schedule` route (owner-only; employee self-service is deferred to the auth pass) where the owner schedules his crew (Adam, Johnathan full-time; Peyton intern) onto rough-in and finish jobs for accepted quotes, plus free-form service calls. Two new tables — `crew` (editable list managed under Pricing → Crew; deactivate-only) and `schedule_assignments` (one row per crew member per day; `quote_id` and `phase` both optional so a service call has no quote/phase; `title`/`location` stored as an editable snapshot; optional clock times default all-day; status scheduled/completed/cancelled) — with permissive dev RLS policies to be tightened alongside the auth pass. New `lib/schedule.ts` (types + server fetchers `getCrew`/`getScheduleRange`/`getSchedulableJobs` + time/phase/overlap helpers), `app/schedule/page.tsx` (server, `force-dynamic`, fetches the current week), `components/schedule-board.tsx` (client week board: Prev/Today/Next nav, 7-day list that becomes a 7-column grid on desktop, add/edit modal, refetches the week on nav and after every save), `components/schedule-assignment-form.tsx` (client form with a Quote-job vs Service-call toggle; picking a quote pre-fills title/location and reveals a Rough-In/Finish phase; soft overlap warning), and `components/crew-editor.tsx` (admin editor mirroring the pricing editors). Added a Schedule nav link. Phase 2 (desktop week grid with native HTML5 drag-to-reschedule) to follow. Owner must run the crew + schedule_assignments SQL (DDL + policies + seed) in the Supabase SQL Editor before testing.
- 2026-06-22: Minor code-hygiene pass (internal, no user-facing change). (1) Hoisted the duplicated `normalizeStatus` helper (was copy-pasted in `app/page.tsx`, `app/quotes/page.tsx`, and `app/quotes/[id]/page.tsx`) into a single `normalizeStatus` export in `lib/types.ts` next to the `QuoteStatus` type; the three pages now import it. (2) Removed the dead `isFullyPaid` function from `lib/invoice-calculations.ts` and the unused `isFullyPaid` field from the `ReceivableJob` type + its assignment in `app/receivables/page.tsx`. `isFullyPaid` (per-invoice paid flags) was superseded by the balance-based `isPaidInFull` in the 2026-06-22 reconciliation work but kept only for this unused field; the AR table already partitions off `totalOutstandingCents === 0 && totalInvoicedCents > 0`, which is `isPaidInFull`, so `isPaidInFull` is now the single "paid in full" definition with no leftover. (3) Switched the settings editor (`components/settings-editor.tsx`) from `.update().eq("id", 1)` to `.upsert({ id: 1, ... }, { onConflict: "id" })` so saving business info self-heals if the `app_settings` id=1 seed row is ever missing (previously the update silently matched 0 rows and reported "Settings saved" while saving nothing). The upsert's insert path requires an `app_settings` insert anon policy, which was missing from the README policy block and has been added; run the one-line `create policy ... for insert` SQL below if it has not been run. (4) Added `export const dynamic = "force-dynamic"` to `app/quotes/[id]/page.tsx` and `app/quotes/[id]/invoices/page.tsx`, which were relying only on the shared client's `cache: "no-store"`; the README's "all live-data pages force-dynamic" claim is now literally true.
- 2026-06-22: Multi-page PDFs now repeat the header and footer on every page. Previously a quote or invoice that spilled onto a second page rendered page 2+ bare (no logo/business name at the top, no contact line at the bottom) because the header and footer were ordinary in-flow content that only rendered once. The header and footer `<View>`s in `components/pdf/pdf-shared.tsx` (Summary Quote + Invoice) and `components/pdf/detailed-quote-document.tsx` (Detailed Quote) are now `fixed` and absolutely pinned (top:0 / bottom:0), and the page top/bottom padding was raised (48 -> 112 top, 48 -> 56 bottom) to reserve space so the flowing line-item content never slides under the repeated header/footer. The footer also appends "Page X of Y", but only when the document is actually more than one page (a 1-page quote still shows just the contact line, no "Page 1 of 1"). Owner to visually verify on Vercel with a 2-page Detailed Quote. Remaining known limitation (not addressed): on a 2-page Detailed Quote the line-items table itself splits at the page break, so the bordered box and the column-header row (Item / Qty / Unit / Unit Price / Line Total) do not repeat on page 2 — the rows continue but without column headers.
- 2026-06-22: Cosmetic polish pass. (1) Removed em dashes from user-facing app copy (README says none allowed): invoice card titles ("Invoice 1: Rough-In (Initial)"), receivables placeholders ("N/A" instead of an em dash for missing issued date / missing invoice), pricing-admin helper text, and the pricing-level description fallback. (2) Invoice PDF filename now prefixes `invoice-` (e.g. `invoice-Q-20260619-001-R.pdf`) so it is recognizably an invoice in a downloads folder. (3) The initial invoice PDF no longer prints a "Permit Fee $0.00" line when there is no permit fee; the on-screen preview matches (both render from the shared `lib/invoice-pdf.ts` props). (4) Fixed preview-vs-PDF drift: the on-screen notes/terms boxes on the Detailed Quote, Summary Quote, and invoice previews are now hidden when empty (matching the PDFs, which already hid them); the Detailed Quote preview now shows a "No priced items on this quote." row when empty (matching the PDF); and the Detailed Quote preview no longer leaves a leading " · " when project type is blank (now uses the same `filter(Boolean).join(" · ")` the Summary and invoice previews use).
- 2026-06-22: README drift cleanup (documentation only, no code). Removed the stale "temporary build-status panel" from the `/quotes` route description. Rewrote the Detailed Quote and Summary Quote "Done" bullets (which still said "browser print dialog, no PDF dependency yet") to reflect the completed one-click Download PDF. Updated the Internal Notes section (PDF export is no longer "coming later"; it exists and excludes internal notes) and the Invoicing section (invoices use one-click Download PDF, not the browser print dialog). Added `components/formatted-number-input.tsx` to the file-structure tree. Left the dated history entries untouched as a timeline record.
- 2026-06-22: Guarded editing a saved quote against silently reassigning its ID, and corrected the quote-ID sequencing wording. Previously, opening a saved quote in the builder, clearing the Quote ID field, and saving called `next_quote_id` and overwrote the row's `quote_id` with a brand-new number (changing the client-facing reference and burning a daily number). Now `resolveQuoteIdForSave(currentId, quoteDate, existingRowId)` keeps the existing row's `quote_id` when the field is cleared on an edit (both the builder Save-as-draft and the review Prepare paths pass `savedQuoteId`). A custom ID typed by the owner is still used as-is; a brand-new quote still mints a daily number. Also corrected the "server-side / no gaps" framing in `lib/quote-id.ts` and the README sequencing section: the RPC is invoked from the browser with the public anon key (the increment is atomic in Postgres, but it is not an authenticated server action, so anyone with the anon key can burn gaps until auth lands), and a save that fails after the increment can leave a gap (the number is reserved before the row is written). Abandoned pre-save sessions still do not burn a number.
- 2026-06-22: Reconciled the dashboard lifecycle with Accounts Receivable so a $0-contract accepted quote can no longer show "Pending Payments $0.00" on the dashboard while being dropped from AR. Added a single shared definition of "paid in full" — `isPaidInFull(data)` in `lib/invoice-calculations.ts` — which is true only when there is real invoiced money (`totalInvoicedCents > 0`) and nothing is outstanding, keyed on the outstanding balance rather than the per-invoice paid flags. The dashboard `lifecycleStage`, the invoicing page badge, the saved-quote page badge, and the dashboard-card outstanding line all use it, so every surface agrees with the AR table (which already excluded $0 jobs). A $0-contract accepted quote now stays in Client Accepted instead of Pending Payments; a job with a positive paid invoice plus a $0 unpaid invoice now reads as paid in full (nothing is owed), matching AR.
- 2026-06-22: Fixed a data-integrity bug in invoicing where a paid invoice's amount could silently change. Previously, editing the contract amount, rough-in/finish split, or permit fee and clicking Save Changes recomputed every invoice's amount from the new inputs but kept the old `status` ("paid") and `paidAt`. So a paid invoice's amount could be rewritten while it still showed "Paid {date}", which made Accounts Receivable and the dashboard report money that was never actually collected. Now `components/invoice-builder.tsx` resets any previously-paid invoice to unpaid (clearing `paidAt`) when its amount would change on save, forcing the owner to re-mark it paid against the new amount. Before saving, a plain-English warning lists which paid invoice(s) would change and that they will be reset, so it is never a surprise. Re-saving with no changes still keeps paid statuses (amounts match, nothing resets); editing an unpaid invoice's amount is unaffected.
- 2026-06-19: Production hardening pass. (1) Moved quote-ID sequencing server-side. The builder no longer guesses today's next number client-side (a race that could hand two simultaneous saves the same ID); instead a Postgres `next_quote_id()` function atomically increments a per-day counter (`public.quote_sequences`) via `INSERT ... ON CONFLICT ... RETURNING` and returns `Q-YYYYMMDD-NNN`. The number is reserved at save time, not when the builder opens, so abandoned builder sessions do not create gaps in client-facing IDs; the builder's Quote ID field is blank with a placeholder "Assigned on save" until the quote is saved, and a custom ID typed by the owner is still used as-is. New `lib/quote-id.ts` (`resolveQuoteIdForSave`) is shared by the builder's Save-as-draft and the review page's Prepare paths. Owner must run the one-time SQL (counter table + `security definer` function + grant + `quotes.status` default → `draft`) before deploy. (2) Flipped the `quotes.status` column default from legacy `completed` to `draft` (defensive — every app insert sets status explicitly). (3) Deleted the temporary `components/dashboard-build-status.tsx` build tracker and its usage on `/quotes`. RLS tightening is intentionally deferred until owner/admin login exists.
- 2026-06-19: Renamed the quote/invoice PDF entry buttons. The links that lead to the Download PDF pages used to say "Print" (e.g. "Print Detailed Quote", "Print Summary Quote", and a bare "Print" on invoices and the dashboard cards), which implied printing rather than downloading. Now read "Detailed Quote PDF" / "Summary Quote PDF" (saved-quote and review pages), "PDF" (invoice cards and dashboard cards), and the review-page disabled tooltip reads "Save the quote first to download". The URL segments stay `/print` (internal, not user-facing); only the visible labels changed.
- 2026-06-19: Completed the PDF export upgrade across all four customer-facing printables. Each now has one-click Download PDF rendered server-side with `@react-pdf/renderer`. New shared module `components/pdf/pdf-shared.tsx` holds the colors, page style, and header/info-grid/total/notes/footer/list building blocks (copied from the Detailed Quote styles so every PDF looks consistent; the Detailed Quote stays self-contained). New `components/pdf/summary-quote-document.tsx` (condensed category-subtotal summary) and `components/pdf/invoice-document.tsx` (initial/finish invoice with the previously-invoiced sub-box on the finish invoice). New server helpers `lib/summary-quote-pdf.ts` and `lib/invoice-pdf.ts` load the saved snapshot + live settings and build the pre-formatted props, shared by each preview page and its PDF route (`app/quotes/[id]/summary/pdf/route.tsx`, `app/quotes/[id]/invoices/[kind]/pdf/route.tsx`), so the on-screen preview and the downloaded PDF can never drift apart. The Summary and invoice print pages were refactored to render from the shared props and swap the old `window.print()` button for a Download PDF link. Removed the now-dead browser-print components (`print-quote-button`, `invoice-print-button`) and the `.no-print` / `.print-document` / `@page` / `@media print` CSS from `globals.css`. `categoryDisplayName` moved to `lib/calculations.ts` so the Summary preview and PDF agree on category labels.
- 2026-06-19: Fixed red lines/borders in the Detailed Quote PDF. The subtle `rgba(...)` borders and muted text rendered as red/dark artifacts because react-pdf composites alpha-channel colors inconsistently through the PDF graphics state. Replaced every `rgba()` color in `components/pdf/detailed-quote-document.tsx` with a solid hex pre-blended against the page background so it looks the same to the eye but has no alpha channel. Also added the missing `import React`.
- 2026-06-19: Began the PDF export upgrade (pilot on the Detailed Quote). Added `@react-pdf/renderer` and `experimental.serverComponentsExternalPackages: ["@react-pdf/renderer"]` in `next.config.js` (PDFs are rendered on the server, not in the browser). New `components/pdf/detailed-quote-document.tsx` (a react-pdf `<Document>` recreation of the on-screen Detailed Quote: logo + business header, Quote id + date, Prepared For / Project, the line-items table, Quote Total, notes, footer — built-in Times-Bold/Helvetica fonts, brand palette hex). New `lib/detailed-quote-pdf.ts` (server helper that loads the saved snapshot + live settings and builds the plain pre-formatted props the PDF needs; single source of truth shared by the preview page and the PDF route). New `lib/pdf-logo.ts` (server-only; reads `/public/ffe-logo.png` into a base64 data URI so react-pdf embeds the logo with no network fetch). New route handler `app/quotes/[id]/print/pdf/route.tsx` renders the document to a buffer with `renderToBuffer` and streams it back as a file download. New `components/pdf/download-pdf-button.tsx` is now just a plain link to that route (no client-side react-pdf). `app/quotes/[id]/print/page.tsx` uses the shared helper and swaps the old `window.print()` button for the Download PDF link; the existing HTML layout stays on screen as a preview. An earlier client-side attempt (PDFDownloadLink) blanked the page on load because it rendered the PDF eagerly on mount and threw; switched to server-side generation to avoid any client-side react-pdf. Summary Quote and invoices still use the browser print dialog pending the follow-up pass.
- 2026-06-18: Overhauled the dashboard to read saved quotes from Supabase (`dashboard-saved-quotes.tsx`), made it owner-focused with a compact removable build-status panel, removed the old marketing empty state.
- 2026-06-18: Added saved quote route `/quotes/[id]` (server component, loads from Supabase, no localStorage) and wired the dashboard Open buttons to it.
- 2026-06-18: Added owner-only Internal Notes text box in the builder; notes show on owner views (review, saved quote) but never on customer-facing output. No schema change (field already existed).
- 2026-06-18: Enabled editing saved quotes (`/quotes/[id]/edit`) and deleting saved quotes (removes row from Supabase, with confirm). Save now upserts (update vs insert) which also prevents duplicate saves; the Save button locks after success. Added the anon delete RLS policy.
- 2026-06-18: Removed the confusing "Clear Review Quote" button from the review page. After a successful save, the review page now shows "View saved quote" and "Start a new quote" links instead.
- 2026-06-18: Clear the active quote (browser working copy) after a successful save, so the owner is not stuck in a loop with the saved quote still loaded as the active quote. From save onward, the owner works from the saved file via `/quotes/[id]` and `/quotes/[id]/edit`.
- 2026-06-18: Stop quote IDs from duplicating. New quotes now get a daily sequence number (Q-YYYYMMDD-001, -002, ...) by checking Supabase for today's highest number. Editing a saved quote keeps its existing ID.
- 2026-06-19: Added the printable Detailed Quote page (`/quotes/[id]/print`) with FFE branding, contact info, line items, total, and customer-facing notes. Uses the browser print dialog (Print / Save as PDF), no PDF dependency. Enabled Print buttons on the saved quote view and (after save) the review page. Internal notes are excluded (customer-facing only).
- 2026-06-19: Added the quote status pipeline (draft, prepared, accepted). The dashboard is now an async server component that groups saved quotes into three stacked stages (Draft / Prepared / Client Accepted), each with a one-line description of its meaning. New `status-badge`, `quote-status-button`, and `dashboard-quote-section` components; the old self-fetching `dashboard-saved-quotes.tsx` was deleted. The builder gained a "Save as draft" button (status draft, client name required) that saves to Supabase and clears the browser working copy. The review page primary action is now "Prepare" and writes status prepared. The saved-quote page shows a color-coded badge and status-aware actions (Prepare, Mark accepted, Move back to drafts, Reopen as prepared, plus a disabled Start invoicing placeholder). Status changes use `supabase.update` + `router.refresh()`, which requires the anon update RLS policy. Owner must run `update quotes set status = 'prepared' where status = 'completed';` once before deploy so existing saved quotes land in Prepared.
- 2026-06-19: Fixed the dashboard not showing newly saved drafts. Server-side Supabase reads were being cached by the Next.js Data Cache; the shared supabase client now forces `cache: "no-store"` so the dashboard always reflects the latest rows.
- 2026-06-19: Added invoicing for accepted quotes. New `invoice_data` JSONB column on `quotes` (run `alter table public.quotes add column if not exists invoice_data jsonb;` once). New routes `/quotes/[id]/invoices` (setup + invoice list) and `/quotes/[id]/invoices/[kind]/print` (printable invoice). New `lib/invoice-calculations.ts` and components `invoice-builder`, `invoice-paid-button`, `invoice-print-button`, plus an `InvoicePaidBadge`. Initial invoice = rough-in (default 50% of contract, editable) + permit fee; finish invoice = remainder; warn if the split does not total 100%; mark each invoice paid/unpaid; dashboard Accepted card and saved-quote page show outstanding balance. Reuses the printable-document pattern and the client-mutation + router.refresh pattern. Owner must run the alter table SQL before deploy.
- 2026-06-19: Extended the dashboard lifecycle from three stages to five by deriving two new stages from invoice setup. Accepted quotes now split into Client Accepted (no invoices yet), Pending Payments (invoices set up, money outstanding), and Paid in Full (every invoice paid). No schema change and no new buttons; the stages are computed on the fly by `lifecycleStage()` in `lib/invoice-calculations.ts` from the row status plus `invoice_data`. `StatusBadge` now shows the derived stage. The dashboard renders five stacked sections (Stage 1 Draft through Stage 5 Paid in Full), each with its own description and empty state.
- 2026-06-19: Confirmed both one-time SQL migrations are applied in Supabase: zero rows still carry `status = 'completed'`, and the `invoice_data` jsonb column exists. The anon UPDATE policy is also present. Removed the pre-deploy migration reminder from the Pending list.
- 2026-06-19: Added a pending item and standing practice note: only admin may pull a quote back out of the invoicing lifecycle once access levels exist (gate the "Reopen as prepared" / "Move back to drafts" buttons on accepted, pending-payment, and paid-in-full quotes), and the Pending list should be reviewed on every change so accomplished items are removed or marked complete.
- 2026-06-19: Added the printable Summary Quote page (`/quotes/[id]/summary`). Condensed customer-facing companion to the Detailed Quote: one row per pricing category with its subtotal, then the quote total. No unit prices are shown. New `summarizeByCategory` helper in `lib/calculations.ts` groups `clientFacingLines` by category and sums client-facing totals (post pricing-level/contingency multiplier), preserving first-appearance order and dropping zero-total categories. Reuses `PrintQuoteButton` and the `.print-document` browser-print pattern. "Print Summary Quote" links added to the saved-quote page (prepared and accepted branches) and "Summary" links to the prepared and accepted dashboard cards. Marked the "PDF export: Summary Quote next" pending item complete; the only remaining PDF work is the optional react-pdf one-click-download upgrade.
- 2026-06-19: Moved all pricing and customer-facing text out of the static `lib/seed-data.ts` file into Supabase, with an admin UI. New `/pricing-admin` route edits line items, pricing levels, contingencies, project types, and the business-info / default-quote-notes / invoice-payment-terms settings row (deactivate-only, no hard delete; editable sort order). New `lib/pricing.ts` (`getSettings`, `getPricingCatalog`) reads the catalog server-side; the builder pages and the three print pages now read live from Supabase (`force-dynamic`). `calculateQuote` takes the items/levels/contingencies arrays as parameters and resolves level/contingency by stable id with explicit default-id fallbacks. `quote-builder` and `quote-line-item-picker` take the catalog as props; dropdowns show active rows plus the currently-selected value so old quotes still resolve. `lib/seed-data.ts` was deleted. Owner ran the one-time SQL (five tables + seed + anon RLS policies) in Supabase beforehand. Marked the "Pricing admin" pending item complete.
- 2026-06-19: Added the Accounts Receivable view (`/receivables`). Collections page over every accepted quote with invoice setup, split into two stacked tables: Pending Payments (any job with an outstanding balance, including partially-paid) and Historical Paid (fully paid; a job moves here automatically once the last invoice is paid). One row per job with separate rough-in and finish columns (amount + Paid/Unpaid badge + per-invoice outstanding or paid date), plus a job-level total outstanding and the earliest invoice issued date. Preset period filter (All time / This month / Last 30 days / This quarter / This year) and sort (oldest first / largest outstanding / newest / client), applied client-side. New `app/receivables/page.tsx` (server, `force-dynamic`, queries accepted quotes with `invoice_data` not null), `components/receivables-table.tsx` (client filter/sort/partition), `ReceivableInvoice`/`ReceivableJob` types, and small helpers `invoiceOutstandingCents` (`lib/invoice-calculations.ts`) and `formatDate` (`lib/currency.ts`). Reuses `outstandingCents`, `isFullyPaid`, `computeInvoiceAmounts`, `invoiceReference`. Read-only — no new tables or RLS policies. Added a Receivables nav link and a dashboard shortcut. Marked the "Accounts receivable view" pending item complete.
- 2026-06-19: Restructured the app from a single "Dashboard" into a multi-tool suite. `/` is now an overview dashboard (hub): quick actions (Start New Quote, Receivables, Manage Pricing), four summary tiles (active quotes, awaiting payment + outstanding $, paid in full, manage pricing), the unsaved-working-copy resume card, and a 5-item recent quotes list. The quote lifecycle (the five stacked stages) moved to a new `/quotes` route (the quoting tool) with a "Back to dashboard" link and a Start New Quote button. Nav is now Dashboard / Quotes / Receivables / Pricing / Start New Quote. Quote-scoped back-links ("Back to dashboard") became "Back to quotes" → `/quotes`; pricing-admin and receivables keep "Back to dashboard" → `/`. New `app/quotes/page.tsx` (moved lifecycle + `QuotesHeader`); `app/page.tsx` rewritten as the overview. `DashboardResumeActiveQuote` moved to the overview; `DashboardBuildStatus` stays on `/quotes` (still temporary). No data or schema changes.