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
| `/` | Dashboard. Shows active quote (if any), saved quote history from Supabase, and a temporary build-status panel. |
| `/quotes/new` | Quote builder. Starts a fresh quote or resumes the active browser working copy. |
| `/quotes/review` | Review the completed quote before saving. Reads the active working copy from browser storage. |
| `/quotes/[id]` | View a saved quote loaded from Supabase by database id. Does not use browser storage. |
| `/quotes/[id]/edit` | Edit a saved quote. Loads it from Supabase into the builder; saving updates the existing row. |

## File structure

```
app
  globals.css
  layout.tsx
  page.tsx                      // Dashboard
  quotes
    new/page.tsx                // Builder page
    review/page.tsx             // Review + save
    [id]/page.tsx               // Saved quote view
    [id]/edit/page.tsx          // Saved quote editor

components
  app-shell.tsx
  dashboard-active-quote.tsx
  dashboard-saved-quotes.tsx
  dashboard-build-status.tsx    // TEMPORARY: internal build tracker, safe to delete later
  quote-builder.tsx
  quote-line-item-picker.tsx
  quote-totals-panel.tsx
  delete-quote-button.tsx

lib
  calculations.ts
  currency.ts
  quote-storage.ts
  seed-data.ts
  supabase.ts
  types.ts

public
  ffe-logo.png
```

## How the quote flow works

1. **Dashboard** (`/`) — owner starts a new quote or opens a saved one from history.
2. **Build** (`/quotes/new`) — enter project and client info, pricing setup, adders, internal notes. The builder keeps a temporary working copy in the browser (`localStorage` key `ffe-active-quote`) so work is not lost when moving between builder and review. This working copy is **cleared once the quote is saved to Supabase**; after that the owner works from the saved record. The active quote is purely a pre-save working copy. To abandon an unsaved working copy, use the builder's **Reset Quote** button.
3. **Complete Quote** — validates required fields, saves the working copy, routes to `/quotes/review`.
4. **Review** (`/quotes/review`) — review the customer-facing summary and final total, then save.
5. **Save Quote** — writes to Supabase. If editing a saved quote, it **updates** the existing row; otherwise it **inserts** a new row and remembers the id (in memory) so the View/Edit links work. The button locks after a successful save. **After saving, the browser working copy (active quote) is cleared**, so the owner works from the saved file going forward instead of the temporary form. The review page still shows the success message and links from in-memory state.
6. **Saved quote** (`/quotes/[id]`) — view, edit, or delete the saved quote. From here on, the owner works from the saved file, not the active quote.

### Internal notes (owner only)
The builder has an "Internal Notes" text box. These notes are saved with the quote and shown on the owner views (review and saved quote pages), clearly labeled as not shown to the customer. They are **not** included in customer-facing output. (Customer-facing PDF export is coming later and must continue to exclude them.)

### Deleting quotes
The saved quote page has a Delete Quote button with a confirm step. It removes the row from Supabase. This requires a delete RLS policy (see Supabase setup below).

## Pricing and calculation logic

Pricing seed data lives in `lib/seed-data.ts` (41 items across categories: Base, Lighting, Outlets, Circuits, Panels & Service, Garage, EV, Generator, Specialty, Basement, Fans, Bath Fans, Service Work). Calculations live in `lib/calculations.ts`. Money is stored in cents; `lib/currency.ts` formats it.

Base rate (evaluated in order):
- Manual mode = manual base rate
- Builder/Spec = $5.00 / sq ft
- Small home under 2,500 sq ft = $7.00 / sq ft
- High Ceiling / Complex Switching = $6.50 / sq ft
- Default = $6.00 / sq ft

Pricing levels (adjustment multipliers, not literal gross margin):
- Contractor/Builder = 90%
- Standard/Custom = 100%
- Premium/High-End = 120%

Contingency options: 0% (1.00), 5% (1.05), 10% (1.10), 15% (1.15).

Calculation:
```
base package        = square footage * base rate
adders base total   = sum(quantity * base price)
total before client = base package + adders base total
combined multiplier = pricing level multiplier * contingency multiplier
final quote         = total before client * combined multiplier
```

Do not delete existing pricing item names once quotes exist. The plan is to add an `active` flag later so old quotes stay historically accurate. Saved quotes already store full `quote_data` and `calculation_data` JSONB snapshots, which protects historical pricing.

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
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS is enabled. Development policies (anon can insert, select, delete). These are intentionally permissive for the build phase and **must be tightened before production** (add auth, limit to owner/admin, move writes through server actions if possible). Current dev policies:
```sql
create policy "Allow browser insert quotes during app build" on public.quotes for insert to anon with check (true);
create policy "Allow browser read quotes during app build"   on public.quotes for select to anon using (true);
create policy "Allow browser delete quotes during app build" on public.quotes for delete to anon using (true);
```

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
- Dashboard with saved quote history from Supabase
- Quote builder with pricing calculation, adders, internal notes
- Mobile layout
- Review page
- Active quote browser storage with edit-retains-values
- Supabase save (insert + update), duplicate-save prevention
- Saved quote view (`/quotes/[id]`) and edit (`/quotes/[id]/edit`)
- Delete quote from Supabase
- Owner-only internal notes (not shown to customer)
- Daily-sequence quote IDs (client-side): new quotes get the next number for today from Supabase (e.g. Q-20260618-001, -002, -003)

Pending (rough priority):
- PDF export: Detailed Quote, then Summary Quote, then Rough-In and Finish invoices
- Invoice workflow (contract amount, permit fee, rough-in/finish percentages, warn if not 100%)
- Owner/admin login (Supabase Auth), one owner + one builder/admin
- Tighten Supabase RLS for production
- Pricing admin (move pricing to Supabase, active/inactive items, preserve historical snapshots)
- Quote status management (draft, completed, sent, accepted, rejected, invoiced)
- Move quote ID sequencing server-side for hard multi-user concurrency safety (the current client-side sequence is fine for a single owner)
- Remove the temporary `dashboard-build-status.tsx` component once the build is complete

## Recent work (history)

- 2026-06-18: Overhauled the dashboard to read saved quotes from Supabase (`dashboard-saved-quotes.tsx`), made it owner-focused with a compact removable build-status panel, removed the old marketing empty state.
- 2026-06-18: Added saved quote route `/quotes/[id]` (server component, loads from Supabase, no localStorage) and wired the dashboard Open buttons to it.
- 2026-06-18: Added owner-only Internal Notes text box in the builder; notes show on owner views (review, saved quote) but never on customer-facing output. No schema change (field already existed).
- 2026-06-18: Enabled editing saved quotes (`/quotes/[id]/edit`) and deleting saved quotes (removes row from Supabase, with confirm). Save now upserts (update vs insert) which also prevents duplicate saves; the Save button locks after success. Added the anon delete RLS policy.
- 2026-06-18: Removed the confusing "Clear Review Quote" button from the review page. After a successful save, the review page now shows "View saved quote" and "Start a new quote" links instead.
- 2026-06-18: Clear the active quote (browser working copy) after a successful save, so the owner is not stuck in a loop with the saved quote still loaded as the active quote. From save onward, the owner works from the saved file via `/quotes/[id]` and `/quotes/[id]/edit`.
- 2026-06-18: Stop quote IDs from duplicating. New quotes now get a daily sequence number (Q-YYYYMMDD-001, -002, ...) by checking Supabase for today's highest number. Editing a saved quote keeps its existing ID.