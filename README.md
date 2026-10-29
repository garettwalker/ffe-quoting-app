# Freedom Family Electric — Quoting App

A standalone web quoting application for **Freedom Family Electric**, replacing an older Google Sheets + Apps Script quote system. Built for the owner to create, review, save, and eventually export electrical quotes for residential work (new builds, custom/spec homes, large homes, service and remodel).

This README is the long-term context file for the project. It is meant for both the owner and any AI coding assistant picking the project up later. Keep the **Pending** list and `CHANGELOG.md` updated as things change.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres) for saved quote storage
- Vercel for deployment (auto-deploys from `main` on GitHub)

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Overview dashboard — a landing page, not an analytics view. Start New Quote button plus an unsaved-working-copy resume card, then one clickable tile per nav-menu location (Work: Quotes / Customers / Schedule / Projects, Money: Receivables / P&L / Email Log, Setup: Pricing Admin) with a live stat where it's cheap (active quotes, customer count, this week's crew jobs, jobs in progress, outstanding $). The most recent quotes (8) sit below with lifecycle badges, linking into each quote. |
| `/quotes` | The quoting tool. Full five-stage lifecycle pipeline (Draft, Prepared, Client Accepted, Pending Payments, Paid in Full) reading saved quotes from Supabase. A New builds / Service calls / All toggle (`?type=`) partitions the quote types; service calls show a simpler 4-stage strip (Quote / Accepted / Scheduled / Paid). Direct invoices (created without a quote) share the service-call sections, tagged "Direct invoice" on each card. |
| `/customers` | Customer repository. Every quote's Builder / Customer is backed by a re-usable customer record here (backfilled from existing quotes; created on the fly from the quote builder). One row per customer with linked-quote count and total quoted dollars. |
| `/customers/[id]` | Customer detail. Inline editor for name, the email list (add/remove, optional label per email for a husband/wife team), phone, and note, plus the customer's quotes (status + total, linking to `/quotes/[id]`). Editing a customer updates future quotes' autofill only; existing quotes keep their own name/email snapshot. v1 is edit-only (no delete / merge). |
| `/quotes/new` | Quote type chooser. No `?type` → three cards: **New Build** (the catalog-driven quote, `?type=new_build`), **Service Call / Other** (freeform line items, `?type=service_call`), or **Direct Invoice** (an invoice without a quote, `?type=direct_invoice`). Resumes the active browser working copy if one exists (routing to the correct builder per stored type). |
| `/quotes/review` | Review the completed quote before saving. Reads the active working copy from browser storage. |
| `/quotes/[id]` | View a saved quote loaded from Supabase by database id. Does not use browser storage. |
| `/quotes/[id]/edit` | Edit a saved quote. Loads it from Supabase into the builder; saving updates the existing row. |
| `/quotes/[id]/print` | Printable Detailed Quote page (customer-facing). One-click **Download PDF** (rendered server-side with react-pdf); the on-screen layout is a preview of the PDF. |
| `/quotes/[id]/print/pdf` | Server route: renders the Detailed Quote to a PDF buffer (react-pdf) and streams it back as a file download. |
| `/quotes/[id]/summary` | Printable Summary Quote page (customer-facing). Condensed: one subtotal per pricing category plus the quote total, no unit prices. One-click Download PDF; on-screen layout is a preview. |
| `/quotes/[id]/summary/pdf` | Server route: renders the Summary Quote to a PDF buffer and streams it back as a file download. |
| `/quotes/[id]/invoices` | Invoicing page for an accepted quote. Set contract amount, rough-in/finish split, and permit fee; record payments (full or **partial**) on any invoice with a date and optional note; download invoice PDFs. Each invoice card shows what has been collected, what is left, and its payment history. |
| `/quotes/[id]/invoices/[kind]/print` | Printable invoice (`kind` = `initial`, `finish`, or `service`). Dispatch is by quote type: a service call or direct invoice routes all three kinds through the service invoice doc (a split service call's `initial`/`finish` are its Deposit/Final; a direct invoice has only `service`); a new build routes `initial`/`finish` through the new-build invoice doc. One-click Download PDF; on-screen layout is a preview. Service/direct invoices use a freeform Description / Qty / Unit Price / Amount table (legacy flat-amount lines omit the Unit Price column). |
| `/quotes/[id]/invoices/[kind]/pdf` | Server route: renders the invoice (`initial`, `finish`, or `service`) to a PDF buffer and streams it back as a file download. |
| `/quotes/[id]/pnl` | **Internal** Job P&L + cost estimator for one quote. Shows revenue (Contracted / Invoiced / Paid, toggle) vs the job's entered cost (material $ buckets + per-person labor split rough-in / finish) and the margin. Costs are entered and saved to `quotes.cost_estimate_data`. Never customer-facing. |
| `/api/email-pdf` | POST API route. Renders a quote/invoice PDF to a buffer (same path as the Download PDF routes) and sends it to a customer as an attachment via Resend. Body: `{ id, doc, invoiceKind?, to, subject?, message? }`. The recipient, subject, and message are pre-filled from the email on file + per-doc defaults and editable before sending. See **Sending email from the app** below. Admin-gated (Phase B). |
| `/api/create-checkout-session` | POST API route. Public. Body: `{ token }` (the HMAC-signed pay-link token). Re-reads the invoice from the DB (service-role; never trusts the browser) and charges the **remaining balance** — refusing with "nothing due" when the invoice is already covered. Stamps the charged amount into the session metadata so the webhook records exactly what was charged. See **Customer online payment (Stripe)** below. |
| `/api/stripe-webhook` | POST API route. Public (Stripe has no session). Stripe calls it to confirm a payment; security is the Stripe signature header + idempotent handling. Skeleton only until Stripe is wired (step 3); returns 503 until `STRIPE_WEBHOOK_SECRET` is set. See **Customer online payment (Stripe)** below. |
| `/api/keepalive` | GET health-check. Runs one trivial Supabase query (head-count on `quotes`) and returns 200, or 503 on query failure. Hit daily by the `.github/workflows/keepalive.yml` cron so the Supabase free-tier project is not paused after 7 days of inactivity. Public and unauthenticated (counts rows only; reads/writes nothing sensitive). |
| `/pay/[token]` | Public customer payment page. The signed link in an invoice email lands here. Shows the invoice, **the remaining balance due** (with the invoice total and payments received when some has already been paid), and a Pay button (which posts the token to `/api/create-checkout-session`). Reads the invoice from the DB via the service-role client; the amount shown/charged always comes from our DB, never the token. |
| `/pay/success` | Stripe success redirect. Thanks the customer. The signed webhook (not this URL) is the source of truth for confirming payment. |
| `/pay/canceled` | Stripe cancel redirect. Acknowledges that no payment was made; the invoice stays unpaid. |
| `/login` | Email + password sign-in (Supabase Auth). Public. Unauthenticated users are redirected here by middleware (Phase B); visiting it while signed in redirects to `/`. |
| `/pricing-admin` | Pricing admin. Edit line items, pricing levels, contingencies, project types, crew, and business info/quote notes/invoice terms stored in Supabase. Deactivate-only (no hard delete). |
| `/schedule` | Schedule. Owner-only week view of the crew's jobs: phone-first day list (7-column grid on desktop), Prev/Today/Next week nav, tap a day to add, tap a card to edit. On desktop, drag a card onto another day column to reschedule it (native HTML5; tap-to-edit is the fallback and the only path on mobile). Entries are either a quote job (rough-in/finish for an accepted quote, title/location auto-filled from the quote) or a free-form service call, and can carry one or more crew. Optional clock times, default all-day. Times + a soft overlap warning. Employee self-service access is deferred to the auth pass. |
| `/email-log` | Email audit log. Read-only, recent-first list of every quote/invoice emailed from the app (date, document, recipient, status), including failed send attempts. One row per send. Pairs with the per-quote Email History section on `/quotes/[id]`. |
| `/receivables` | Accounts Receivable. Two stacked tables — Pending Payments (outstanding balances) and Historical Paid (paid in full) — one row per job with rough-in and finish invoice columns. Preset period filter + sort; the period filter drives the three headline totals as well as the tables. Read-only, derived from `quotes.invoice_data` + the `email_log` (a finish invoice that has never been emailed is "scheduled", not owed yet, and shown but excluded from the invoiced/outstanding totals until it is emailed or paid). Per-invoice cells show the **balance still owed** and a **Partial** badge when some (but not all) of an invoice has been collected, with "X of it collected" beneath. Service-call rows show a single "Service" invoice cell (Finish = N/A) and a "Service call" tag — unless the service call is split into a Deposit + Final, in which case both columns fill (Deposit / Final captions) with the "Service call" tag. Direct-invoice rows show a single "Invoice" cell with a "Direct invoice" tag. The service invoice follows the finish rule (owed only when emailed or paid, not on setup); a split deposit follows the rough-in rule (receivable from setup). |
| `/reports` | **Reports.** Three switchable layouts over the same live data. **One screen** puts the period filters, KPIs, monthly invoiced/collected chart, AR aging, quarter-over-quarter, top customers, and quote-to-paid funnel on one page. **Compare first** leads with this period against the prior (year, quarter, or month), then a quarter table, customer movement, and job-type mix. **Report builder** puts date range, compare, group-by, customer, job-type, and saved views in a rail, with a chart/table toggle. Filters cover period presets plus a custom range, group by month/quarter/year, compare prior year/quarter/month, and customer and job type. Invoiced is attributed to the receivable date (emailed or paid), collected to the payment date, and outstanding to the invoice balance. Derived from `quotes`, `invoice_data`, `payments`, and the `email_log`; Export CSV writes the selected grouping. |
| `/projects` | Project Status Tracker — every accepted job in ONE combined list (newest first), not separated by quote type; service-call cards carry a "Service call" tag and direct invoices a "Direct invoice" tag. New builds show an 8-stage strip (Quote, Rough-in, Rough-in Inspection, Rough-in Billed, Finish, Final Inspection, Final Billed, Paid); service calls and direct invoices show a simpler 5-stage strip (Quote / Accepted / Scheduled / Billed / Paid). New builds: the 4 field stages advance by manual buttons (or back-date/clear via an Edit stages panel). Service calls/direct invoices: a Mark-scheduled advance button plus an Edit stages panel (Accepted ↔ Scheduled; Billed/Paid stay derived from invoicing + the `email_log` + `isPaidInFull` so the tracker can never disagree with `/quotes` or `/receivables`). Filter chips (All / In the field / Billing & payment / Completed) via `?filter=`. Each card also shows the crew from the job's schedule assignments. Writes only `quotes.project_status` (new builds) or `quotes.status` (service calls + direct invoices). |
| `/pnl` | **Internal** P&L report. Every job's revenue vs cost grouped by quarter/year, with period subtotals and an overall total. Revenue basis toggle (Contracted / Invoiced / Paid) + period filter. Read-only, derived from existing quote/invoice data + `quotes.cost_estimate_data`. Never customer-facing. |

## File structure

```
middleware.ts                   // refreshes the Supabase Auth session + redirects unauthenticated users to /login (Phase B)
app
  globals.css
  layout.tsx
  page.tsx                      // Overview dashboard (hub)
  quotes
    page.tsx                    // Quote lifecycle pipeline (5 stages)
    new/page.tsx                // Quote type chooser (New Build vs Service Call vs Direct Invoice) → routes to the right builder via ?type=
    review/page.tsx             // Review + save
    [id]/page.tsx               // Saved quote view
    [id]/edit/page.tsx          // Saved quote editor
    [id]/print/page.tsx         // Printable Detailed Quote (preview + Download PDF link)
    [id]/print/pdf/route.tsx    // Server route: renders the Detailed Quote to a PDF buffer (react-pdf)
    [id]/summary/page.tsx       // Printable Summary Quote (category subtotals, preview + Download PDF)
    [id]/summary/pdf/route.tsx  // Server route: renders the Summary Quote to a PDF buffer
    [id]/invoices/page.tsx      // Invoicing setup + invoice list
    [id]/invoices/[kind]/print/page.tsx  // Printable invoice (initial/finish/service, preview + Download PDF)
    [id]/invoices/[kind]/pdf/route.tsx   // Server route: renders the invoice to a PDF buffer
  api
    email-pdf/route.tsx            // POST API route: renders a PDF to a buffer and emails it via Resend (admin-gated)
    create-checkout-session/route.ts  // POST: public; mints/verifies a pay-link token, reads amount from DB, returns a Stripe Checkout URL (step 3) or {configured:false}
    stripe-webhook/route.ts       // POST: public; Stripe signature-verified, idempotent; confirms payment + writes the ledger (skeleton until step 3)
    keepalive/route.ts            // GET health-check: trivial Supabase query, hit daily by the keepalive cron
  pay
    [token]/page.tsx            // Public customer payment page (verifies HMAC token, reads invoice via service-role, shows amount + Pay button)
    success/page.tsx           // Stripe success redirect (thanks the customer; webhook is the source of truth)
    canceled/page.tsx          // Stripe cancel redirect (no charge; invoice stays unpaid)
  login/page.tsx               // Email + password sign-in (Supabase Auth)
  email-log/page.tsx           // Read-only global email audit log (recent sends, newest first)
  pricing-admin/page.tsx       // Pricing admin (items, levels, contingencies, project types, crew, settings)
  receivables/page.tsx         // Accounts Receivable (pending vs paid, two tables)
  reports/page.tsx             // Reports (server: loads the flat report dataset, renders the client views)
  schedule/page.tsx            // Schedule (owner-only week view; phone day list / desktop 7-col grid)

components
  app-shell.tsx                  // server: header (brand + New Quote + Menu) + main wrapper
  nav-menu.tsx                   // client: slide-out main menu (Menu button + right panel)
  login-form.tsx                 // client: email + password sign-in via Supabase Auth
  logout-button.tsx             // client: sign out + return to /login (header pill or nav-foot full-width)
  dashboard-active-quote.tsx     // slim resume card for unsaved working copies
  dashboard-quote-section.tsx   // one pipeline stage (Draft / Prepared / Client Accepted)
  status-badge.tsx              // draft/prepared/accepted + invoice paid/unpaid badges
  quote-status-button.tsx       // client button that updates quote.status then refreshes
  quote-builder.tsx
  quote-line-item-picker.tsx
  quote-totals-panel.tsx
  delete-quote-button.tsx
  delete-invoices-button.tsx    // clears invoice_data (keep the quote); blocked when a payment exists
  formatted-number-input.tsx    // currency/decimal input used by the builder + invoice setup
  invoice-builder.tsx           // invoice setup form (contract, split, permit) — new builds
  service-quote-builder.tsx     // freeform service-call quote builder (description/qty/amount lines, no pricing levers)
  service-invoice-builder.tsx   // freeform service-call invoice builder (one kind:"service" invoice by default, or an optional deposit/final split reusing kind:"initial"+"finish"; sum of lines)
  direct-invoice-builder.tsx    // direct invoice builder (invoice without a quote): create mode (one-step insert, status "accepted") + edit mode on the invoicing page; Description/Qty/Unit price lines, catalog prefill optional
  service-stage-strip.tsx       // 5-stage progress strip for a service-call project (Quote/Accepted/Scheduled/Billed/Paid)
  service-project-advance-button.tsx  // Mark scheduled / Set up & send invoice / Awaiting payment on a service project card
  invoice-payment-controls.tsx  // record a full or partial payment on any invoice + payment history (was invoice-paid-button.tsx)
  receivables-table.tsx         // AR tables + the three period-aware summary totals
  reports-view.tsx              // client: the three report layouts, filters, saved views, CSV export
  reports/report-charts.tsx     // SVG chart primitives (grouped bars, trend lines, month change, h-bars, funnel)
  schedule-board.tsx            // client week board: week nav, day list/grid, add/edit modal
  schedule-assignment-form.tsx  // client add/edit form (Quote job vs Service call, times, overlap warning)
  crew-editor.tsx               // admin editor for the crew list (add/rename/color/active)
  pricing-admin-ui.tsx          // shared Field/buttons/badges for the admin editors
  pricing-item-editor.tsx       // admin editor for pricing_items
  pricing-level-editor.tsx      // admin editor for pricing_levels
  base-rate-editor.tsx          // admin editor for base_rates (per-sqft rate presets)
  contingency-editor.tsx       // admin editor for contingency_options
  project-type-editor.tsx      // admin editor for project_types
  settings-editor.tsx           // admin editor for the single app_settings row
  pdf/
    pdf-action-bar.tsx          // top toolbar on each printable: Back link + Download PDF anchor + Email PDF button (server component)
    email-pdf-button.tsx         // "Email PDF" client button: inline To/Subject/Message panel, posts to /api/email-pdf
    detailed-quote-document.tsx // react-pdf <Document> recreation of the Detailed Quote printable
    summary-quote-document.tsx  // react-pdf <Document> recreation of the Summary Quote printable
    invoice-document.tsx        // react-pdf <Document> recreation of the printable invoice (initial/finish)
    service-quote-document.tsx  // react-pdf <Document> for the service-call quote (Description/Qty/Amount lines)
    service-invoice-document.tsx // react-pdf <Document> for the service-call invoice (Description/Qty/Amount lines)
    pdf-shared.tsx              // shared colors/styles/header/footer/total/notes/list building blocks for the PDFs
  pay/
    pay-button.tsx              // client: posts the signed token to /api/create-checkout-session, redirects to Stripe or shows "being set up"
    copy-pay-link-button.tsx   // client (admin invoicing page): copies the signed pay URL to clipboard + a preview link

lib
  calculations.ts
  currency.ts
  detailed-quote-pdf.ts         // server: loads quote snapshot + settings, builds the Detailed Quote PDF props
  summary-quote-pdf.ts          // server: loads quote snapshot + settings, builds the Summary Quote PDF props
  invoice-pdf.ts                // server: loads quote row + invoice setup + settings, builds the invoice PDF props (new builds)
  service-quote-pdf.ts          // server: loads a service-call quote + builds the service quote PDF props; fetchQuoteType() dispatch helper
  service-invoice-pdf.ts        // server: loads a service-call invoice + builds the service invoice PDF props
  invoice-calculations.ts       // invoice amount math + outstanding balance + lifecycle stage (new build + service)
  reports.ts                    // client-safe report types + period windows + aggregation (KPIs, buckets, customer/type mix, aging, funnel)
  reports-server.ts             // server: flattens quotes + receivable invoices + settled payments into the report dataset
  pdf-logo.ts                   // server-only: reads /public/ffe-logo.png into a base64 data URI for react-pdf
  pricing.ts                    // server-side reads of the live pricing catalog + settings
  quote-id.ts                   // client: resolveQuoteIdForSave (keep an existing id on edit, or ask for the next atomic daily number for a new quote); uses the browser client
  schedule.ts                   // crew + schedule types, pure helpers, and fetcher cores that take a Supabase client (shared by server + browser wrappers)
  schedule-server.ts            // server schedule data access (getCrew/getScheduleRange/getSchedulableJobs via getSupabaseServer)
  schedule-client.ts            // client schedule reads (board week-navigation via getSupabaseBrowser)
  send-pdf-email.tsx            // server-only: renders a quote/invoice PDF to a buffer (reuses the /pdf helpers) and sends it via Resend; buildEmailDefaults + isValidEmail live here
  email-log.ts                  // server-only: append-only email audit log (logEmailSend + getEmailHistoryForQuote + getRecentEmailLog)
  payments.ts                   // server-only: Stripe webhook ledger helpers (upsertStripePayment/updatePaymentStatus/setInvoicePaid/readInvoiceAmount/recordWebhookEvent; service-role)
  pay-token.ts                  // server-only: HMAC-signed stateless pay-link tokens (createPayToken/verifyPayToken/buildPayUrl + paymentsConfigured)
  supabase-env.ts               // shared lazy env reader for the auth clients (throws at call time, not build time)
  supabase-browser.ts           // client-only singleton Supabase client (carries the logged-in session)
  supabase-server.ts            // server Supabase client (reads session from cookies; setAll is a no-op in RSC)
  supabase-admin.ts             // server-only service-role client (bypasses RLS; keepalive + Stripe webhook + public /pay page read; never reaches the browser)
  auth.ts                       // server role helpers: getServerUser / isLoggedIn / isAdmin (role from app_metadata)
  quote-storage.ts
  types.ts

public
  ffe-logo.png

mockups
  font-options.html            // static design mockup: serif vs sans pairings (reference)
  sans-options.html            // static design mockup: sans families + heading weights
  reporting-mockups.html       // static design mockup: three reporting page layouts, sample data, not wired to the app
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

**Service-call quotes** (where `quote_type = 'service_call'`) use a simpler 4-stage lifecycle — Quote / Accepted / Scheduled / Paid — derived by `serviceLifecycleStage()` in `lib/invoice-calculations.ts`: draft+prepared collapse to "Quote"; "Accepted" is the stored `accepted` status; "Scheduled" is a manual **Mark scheduled** button (a stored `status = 'scheduled'` write — new builds never set this); "Paid" is derived from the single service invoice being paid in full. The `/quotes` pipeline shows a New builds / Service calls / All toggle (`?type=`); service calls show four sections (Quote / Accepted / Scheduled / Paid) instead of the five new-build sections. `QuoteStatus` is `draft | prepared | accepted | scheduled` — there is no "paid" status (paid is always derived from invoices, never stored). `StatusBadge` renders both stage types; the `/projects` tracker gives service calls their own 5-stage strip (see `/projects` route above).

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
- Each invoice can be paid in full or in part. **Record payment** takes any amount (with the date received and an optional note), so a one-off partial payment is recorded as money in rather than as a paid/unpaid flag; **Mark paid in full** records the remainder as one entry. See the **Partial payments** subsection below. The `/quotes` Accepted card, the overview "Awaiting payment" tile, and the invoicing page show the outstanding balance or "paid in full."
- Each invoice has a printable page (`/quotes/[id]/invoices/[kind]/print`, kind = `initial` or `finish`) with one-click Download PDF; the on-screen layout is a preview of the PDF. Invoice references are `{quote_id}-R` (initial/rough-in) and `{quote_id}-F` (finish).
- **Editable line items (independent of the quote).** The invoice setup form has a **Line Items** editor: an editable table with the same columns as the saved-quote page's customer-facing line items — **Item · Qty · Unit · Unit Price · Line Total** — with the contract shown in a table footer ("Contract (sum of line items)"). Each line is a real priced item pulled from the pricing catalog (the same adder options the quote builder uses), with a **quantity**, an **editable unit price** (defaults to catalog base × the quote's pricing-level multiplier), and a customer-facing **comment** that sits in its own full-width row beneath the line's columns so it spans the whole table. Add lines from a catalog dropdown; edit quantity / price / comment; remove. The **contract amount is the sum of (quantity × unit price)** across the lines — it is no longer hand-entered when line items exist. The rough-in/finish split and permit fee still produce the two invoices (initial = rough-in % of contract + permit; finish = remainder), so the % model is preserved; the line items just become the source of the contract. The line items print in a Scope of Work section on both invoices (Initial + Finish, on screen + PDF) showing each line's "qty × unit price = total" and comment. The list is **seeded from the quote** (its line items, quantities, client prices, and comments) the first time invoicing is set up, then lives on the invoice in `invoice_data.scopeLines` and is edited there independently of the quote — the quote stays a point-in-time estimate and final adjustments happen on the invoice. Legacy invoices set up before line items (which have a hand-entered contract and no `scopeLines`) keep working as-is: they show the editable Contract Amount field and no lines, and the PDF backfills a display-only scope from the quote until the owner adds lines and saves (at which point the contract becomes the sum of the lines). Editing a comment on a paid invoice is money-free and never resets anything; changing a line's quantity/price (and thus the contract) can reset a paid invoice — see below.

Invoice setup is stored as JSONB in the `quotes.invoice_data` column (null until set up). Saving invoice setup preserves existing collected amounts by invoice kind — a paid invoice's amount is never changed silently. If the owner's current line items / split / permit inputs would change the amount of a **finish** invoice that has money collected against it, saving keeps the money, recomputes the paid/unpaid status from it, and shows a clear warning beforehand naming the new balance; an amount below what was collected is allowed and flagged **Overpaid by $X** (see **Partial payments** below). The **rough-in (initial) invoice is frozen once it has any payment against it** (not only when fully paid): its amount never changes on save, and any later edit to the line items, contract, or permit fee flows **only to the finish invoice** (finish = contract + permit − collected rough-in). The rough-in/finish split is bypassed while the rough-in has money against it, so the % fields are locked and the live preview shows the lock. This matches how FFE actually bills: the rough-in is collected during construction and the finish is settled at the end, so changes after rough-in payment adjust only the remaining finish invoice. `invoice_data.scopeLines` is optional so invoices set up before the field existed still load: the PDF/print path backfills a display-only scope from the quote's `calculation_data.clientFacingLines` when `scopeLines` is absent, and the first time the owner saves with line items the builder persists `scopeLines` so the invoice becomes independent from that save on. Invoicing math lives in `lib/invoice-calculations.ts`.

**Service-call invoicing** (where `invoice_data.quoteType === 'service_call'`) is intentionally simpler in its default shape: a **single** `kind: "service"` invoice with a freeform line editor (Description · Qty · Unit price · computed Amount + optional comment, seeded from the quote's `serviceLines` then independent), no rough-in/finish split, no permit, no scope-of-work section, no paid-rough-in freeze — the quick-job model (troubleshoot, a small repair) and the shape every service quote saved before the split option existed keeps. Each line's amount is **quantity × unit price**, computed live (never typed). The invoice amount is the sum of the line amounts; the contract amount equals the invoice amount. A service invoice with money collected whose amount changes keeps the money, recomputes its status, and warns with the new balance (same rule as a finish; see **Partial payments**). The invoice reference suffix is `-S` (e.g. `Q-20260825-001-S`) and it reserves a shared `INV-NNNN` number on first save. AR owes a service invoice only when it has been emailed or paid (the finish rule, not the rough-in "owed on setup" rule). The service invoice PDF (`components/pdf/service-invoice-document.tsx`) reuses the shared PDF blocks with a Description / Qty / Amount line table that gains a **Unit Price** column when any line carries a unit price (legacy flat-amount lines — quotes saved before the qty × price model — render the old three-column table; no backfill needed).

**Direct invoice (create an invoice without a quote).** A third record type, `quote_type = 'direct_invoice'`, for jobs that never get a quote: the owner enters the Builder/Customer (via the same customer picker), optional Project Name / address / internal notes, and manual line items (Description · Qty · Unit price · computed Amount), optionally prefilled from the pricing catalog (`components/catalog-picker.tsx` — the list price drops in, no pricing-level multiplier) or as blank freeform lines — **every field stays editable to anything**. New lines insert **at the top** of the list (same as the other builders). Saving is **one step** (no review/prepare/accept): the builder inserts a `quotes` row with `quote_type = 'direct_invoice'`, `status = 'accepted'`, and a complete `invoice_data` holding a single `kind: "service"` invoice with its own `INV-NNNN` number — no SQL or new columns (the `quote_type` column takes any text; the `invoice_kind` constraints already allow `'service'`). Downstream it rides the unsplit service-call machinery everywhere (`isUnsplitServiceCall()` in `lib/invoice-calculations.ts` matches the type): one invoice card labeled **Invoice** on the invoicing page (edit mode lives there via the same `DirectInvoiceBuilder`), the service invoice PDF (titled just "Invoice"), the Unit Price column (its lines always carry unit prices), Stripe pay link, email, AR (single "Invoice" cell, owed only when emailed or paid), the `/projects` service strip, and the 4-stage `/quotes` lifecycle. It has **no quote document**: the quote PDF, summary, and their email paths 404 for it (and its card actions link to the invoice instead), and the edit page refuses it (edit the lines on the invoicing page) so the row can never be re-typed into a quote. Its working copy lives in the shared `ffe-active-quote` slot (resume works from the chooser; the `/quotes/review` page refuses a direct-invoice draft so the two-step flow can never half-create one).

**Optional deposit/final split for a service call.** A service call can instead be billed as a **Deposit** (`kind: "initial"`) + a **Final** (`kind: "finish"`) — reusing the existing new-build two-invoice machinery, with `permitFeeCents = 0` and a deposit % of the contract (default 50; final = remainder). This lets Chad bill a small remodel sized like a service call as 50% up front / 50% at finish without a full new-build quote. The split is **optional** (off by default; quick jobs stay one invoice due on completion) and is chosen by a "Billing schedule" toggle in `ServiceInvoiceBuilder`; the toggle is **locked while any invoice has money collected against it** so a shape change can't orphan a payment record. Once the **deposit has any payment collected it is frozen** — later line-item edits flow only to the final (finish = contract − collected deposit), mirroring the new-build rough-in freeze; the deposit-% field is disabled while the deposit has money against it. Detection helper `isUnsplitServiceCall(data)` (= `quoteType === "service_call"` AND a `kind: "service"` invoice is present) narrows the `computeInvoiceAmounts` early-return so a **split** service call (initial + finish, no `service` invoice) falls through to the existing two-invoice split path with the paid-deposit freeze — no new math. The split-service PDFs reuse `ServiceInvoicePdfDocument`; the **final** carries a "previously invoiced (Deposit)" block above the amount due (mirroring the new-build finish). The print/pdf/email dispatch is by **quoteType** (a service call routes ALL of its invoice kinds — service/initial/finish — through the service loaders/documents; a new build routes initial/finish through the new-build ones). The invoicing page (`/quotes/[id]/invoices`) branches: an **unsplit** service call → `ServiceInvoiceBuilder` + one `InvoiceCard`; a **split** service call → `ServiceInvoiceBuilder` + two `InvoiceCard`s (Deposit / Final); a new build → the existing `InvoiceBuilder` + two cards. AR (`/receivables`) renders a split-service row with Deposit + Final cells (both columns) and a "Service call" tag; an unsplit service row keeps the single "Service" cell with Finish = N/A. The `/projects` service-call 5-stage strip lights "Billed" when ANY invoice is emailed/paid and "Paid" when the job is paid in full, so both shapes share one path. The public pay page relabels the title to "Deposit Invoice" / "Final Invoice" / "Service Invoice" for a service call. Stripe/pay, customers, and P&L are already kind-agnostic and need no change. No schema change, no SQL.

**One-time SQL (run in the Supabase SQL Editor before deploying invoicing):**
```sql
alter table public.quotes add column if not exists invoice_data jsonb;
```
No new RLS policies are needed; the existing anon select/update policies cover the column.

### Payments ledger
The `payments` table is the append-style ledger of money received: one row per payment, with its own amount, method, date, and who recorded it. It is the audit trail; the **collected total** on the invoice (`invoice_data.invoices[].paidCents`) is what every screen reads for money math. Both are written together on every money event (ledger row first, then the invoice mirror), so a failure between the two writes never loses the record that money came in.

Two things write to it: the manual payment controls on the invoicing page (`method = 'manual'`, `status = 'succeeded'`, `recorded_by` = the admin's email) and the Stripe webhook (`method = 'card'` / `'ach_debit'`, via the service-role client, which bypasses RLS). Only `status = 'succeeded'` rows count toward a balance — an ACH still `processing` is shown as in progress and never added to the collected amount.

The two writes are non-atomic across two queries (a known v1 limitation; a future Postgres RPC can do both in one transaction) — if the invoice mirror write fails, the ledger row still exists and a warning shows so the owner can check the balance before doing anything else.

**One-time SQL (run in the Supabase SQL Editor before deploying):** `supabase/payments-table.sql` — creates the table + indexes + admin-only RLS policies (select/insert/update/delete, gated by `public.is_admin()`). Safe to re-run. The Stripe webhook writes via the service-role client which bypasses RLS, so it needs no policy here.
```sql
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
  recorded_by text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
-- + indexes on quote_id and stripe_payment_intent_id; RLS enabled; admin-only
--   select/insert/update/delete policies gated by public.is_admin().
```
The `invoice_kind` list above was later widened to include `'service'`, and a `note` column was added (both are one-time alters, given inline in chat when they were introduced).

### Partial payments
An invoice does not have to be all-or-nothing. **Record payment** on any invoice card (rough-in, finish, deposit, final, service, direct invoice) takes an amount, the date it was received, and an optional note ("Check #1043, stalled project") — that is how a one-off payment partway through a stalled job gets recorded without pretending the whole invoice was collected.

**The model.** `InvoiceRecord` gained an optional `paidCents` (money collected against that invoice). `status` stays exactly as it was and is still authoritative for **full** payment: it reads `"unpaid"` until `paidCents >= amountCents`, so a partially paid invoice keeps `status: "unpaid"` and every existing reader of `status === "paid"` stays correct without edits. `invoicePaidCents()` in `lib/invoice-calculations.ts` falls back to the legacy flag when `paidCents` is absent (`status === "paid" ? amountCents : 0`), so **every invoice paid before this change reads correctly with no backfill and no schema change on `quotes`**. All the derived money helpers (`outstandingCents`, `invoiceOutstandingCents`, `invoiceIsReceivable`, `isPaidInFull`, `lifecycleStage`) now work off balances, which is why `/receivables`, the dashboard tiles, the Customers totals, and `/projects` followed along with no changes of their own.

**On the invoice card** (`components/invoice-payment-controls.tsx`): a progress line (`Paid $15,000.00 of $30,945.50 · $15,945.50 due`) with a bar, the payment history (amount, date, method, note, who recorded it), **Record payment** (defaults to the remaining balance, with a live "New balance: $X" preview), **Mark paid in full** (records the remainder as one entry, so every dollar has a ledger row), and **Clear payments** (removes this invoice's hand-recorded rows and zeroes the collected total). `Remove` on a manual row deletes just that payment; a Stripe row instead says "Reverse in Stripe" — real card/ACH money is never deleted from the app (a refund in Stripe is what clears it, and the webhook updates the invoice). **Clear payments** is blocked outright when real online money has settled, so the app can never disagree with the ledger.

**Amount changes keep the money.** Editing an invoice's amount no longer resets it to unpaid and orphans its ledger row. A finish/final/service invoice with money collected keeps its `paidCents`, recomputes its status, and shows a warning naming the new balance before saving; an amount *below* what was collected is allowed and flagged "Overpaid by $X" (adjust the amount, or handle the difference as a credit or refund outside the app). The **freeze rule now triggers on any payment, not just full payment**: once the rough-in (or a service deposit) has any money against it, that invoice is frozen and later line-item / contract / permit edits flow only to the finish (finish = contract + permit − paid rough-in), exactly as before. This matters for the partial case — a $15,000 partial on the rough-in pins it just as a full payment would.

**Reporting.** A partially collected invoice shows a **Partial** badge instead of a plain Unpaid, and reports its **balance** as outstanding everywhere (`/receivables` per-invoice cells and job totals, the dashboard Outstanding tile, the quote pipeline, the invoicing page header "Collected so far"). Money collected raises the "Collected this month" figure immediately, straight from the ledger. The invoice **PDF and print preview gain a "Payments received / Balance due" block** when the invoice has payments (the total box is relabeled Balance Due), which names the date the most recent payment was received beside "Payments received" so the customer's copy carries when the money came in; a clean invoice is unchanged.

**Online payment charges only the balance.** `/api/create-checkout-session` refuses when nothing is due and charges `invoiceBalanceCents(invoice)`, stamping the charged amount into the session metadata so the webhook records exactly what was charged; the public `/pay/[token]` page shows the balance, the invoice total, and the payments received. The webhook **recomputes** the collected total from the ledger rather than adding a delta, so a redelivered event can never double-count, and `charge.refunded` uses the cumulative refunded amount, so refunding one of several payments no longer wipes the rest.

Recording a hand payment is blocked while an online payment is still processing, with a message saying why, so the same money cannot be counted twice.

### Customer online payment (Stripe)

Customers can pay an invoice online through a signed link. The link is a **stateless HMAC token** (`lib/pay-token.ts`): it encodes the quote's uuid + invoice kind, signed with `PAY_LINK_SECRET` (a server-only random string). It is unguessable, carries no enumerable DB id, and never expires on its own (rotating `PAY_LINK_SECRET` invalidates every outstanding link at once). The public `/pay/[token]` page verifies the signature, then **re-reads the invoice + amount from the database via the service-role client** — the amount shown and charged always comes from our DB, never from the token or the browser. The page has no user session and the database is admin-only under RLS, so the service-role client (which bypasses RLS) is the only way a public page can read the invoice.

Flow: a Pay button on `/pay/[token]` posts the token to `/api/create-checkout-session`, which re-reads the amount from the DB and returns a Stripe Checkout URL to redirect to. Stripe redirects back to `/pay/success` or `/pay/canceled`, but the **signed webhook** (`/api/stripe-webhook`) is the source of truth for confirming payment — the redirect URL can be tampered with, so the webhook is what writes the `payments` ledger row and flips the invoice's paid flag. The webhook is signature-verified and idempotent (a `stripe_webhook_events` log keyed by Stripe event id, and a unique index on `payments.stripe_payment_intent_id` so multiple events for one payment update one row). Card payments succeed immediately at `checkout.session.completed` (`payment_status = paid`); ACH (US bank account) payments are `processing` at that point and settle days later — `payment_intent.succeeded` flips the flag then. `payment_intent.payment_failed` records a failure (invoice stays unpaid); `payment_intent.canceled` marks the row failed (an owner-cancelled incomplete attempt self-cleans instead of sitting `processing` forever — the flag is not touched, since a cancel is not a refund and the invoice may be paid by a different attempt); `charge.refunded` marks the ledger row refunded and reverses the paid flag.

**Double-payment guard:** before creating a new Stripe session, `/api/create-checkout-session` checks the ledger for an active payment on that invoice (`processing`/`pending`/`succeeded`) and refuses with a clear "a payment is already in progress" message (HTTP 409) if one exists. This closes the live-ACH window where a payment sits `processing` for 1-3 business days while the invoice flag is still unpaid — without it, a customer who reopens the link could pay again and be double-charged. A `failed`/`refunded`/cancelled payment does not block; those are retries. (`hasActivePayment` in `lib/payments.ts`, service-role read; fails open on a read error, since the invoice paid flag is the primary guard.)

**ACH per-payment cap:** Stripe limits ACH (US bank account) to a per-payment max on the account (currently $20,000; Stripe can raise it with more verification). `ACH_LIMIT_CENTS` in `lib/payments.ts` is the single source of truth. `/api/create-checkout-session` only offers `us_bank_account` when the invoice is at or under the cap (`achAvailableForAmount`); over the cap it offers **card only** so the customer never hits a mid-Checkout ACH rejection. The `/pay` page shows a note explaining the cap and pointing to card or a mailed check when an invoice is over it. Bump the constant if Stripe raises the limit.

**Two entry points to a pay link:**
- **Invoice email body:** `buildEmailDefaults` (in `lib/send-pdf-email.tsx`) appends a "Pay online here: <link>" line to the invoice email message, but **only when `paymentsConfigured()` is true** (Stripe wired + `PAY_LINK_SECRET` + `APP_URL` all set). Until then, customers get the standard "payment details are on the invoice" body so they're never sent to a dead "being set up" page.
- **Admin invoicing page:** each invoice card shows a **Copy payment link** button (server-mints the URL, client copies it + a Preview link) whenever `PAY_LINK_SECRET` + `APP_URL` are set.

**Status:** steps 2 + 3 are built. Step 2 laid the plumbing (signed tokens, public `/pay` pages, route skeletons, gated email link, copy-link button) with no Stripe keys. Step 3 wired the real Stripe Checkout Session (card + US bank account / ACH) in `/api/create-checkout-session` and the live signature-verified webhook handler in `/api/stripe-webhook` (`lib/payments.ts` does the idempotent `payments` upsert + invoice-flag flip via the service-role client). No card numbers, CVC, or full bank details are ever stored — Stripe holds them.

**One-time setup to turn on online payment (Stripe, test mode first):**
1. Run `supabase/stripe-webhook-table.sql` in the Supabase SQL Editor (creates `stripe_webhook_events` + a unique index on `payments.stripe_payment_intent_id`; safe to re-run).
2. In Vercel env, set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (your Stripe **test** keys), and `STRIPE_WEBHOOK_SECRET` (after step 4). Redeploy.
3. In the Stripe dashboard (test mode): **Settings → Payment methods** and enable **US bank account** (ACH) so it appears in Checkout alongside cards.
4. In the Stripe dashboard (test mode): **Developers → Webhooks → Add endpoint** pointing at `https://admin.freedomfamilyelectric.com/api/stripe-webhook`, listening for `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`, and `charge.refunded`. Stripe shows the **signing secret** — set it as `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.
5. Test end-to-end: from the admin invoicing page, copy a payment link, open it, pay with the test card `4242 4242 4242 4242` (any future date + any CVC) and confirm the invoice flips to paid + a `payments` row appears (`method = card`, `recorded_by = stripe`). Then test an ACH/bank payment: ACH uses **instant bank verification** (Stripe Financial Connections / Plaid), so the customer logs into their bank in Checkout (use Stripe's test bank login credentials from the docs); the manual "enter bank manually" option is intentionally removed because that path can't complete in one Checkout and leaves the payment "incomplete." Confirm the ACH payment lands as `processing` then `succeeded` a moment later and the invoice flips to paid. Watch the endpoint's event log in the Stripe dashboard to confirm events are received 200.
6. Go live: once the owner's Stripe business account + bank accounts are set up, swap the test keys for live ones and re-register the webhook in live mode.

### Accounts Receivable (`/receivables`)
A read-only collections page that shows every accepted quote with invoice setup, split into **two stacked tables**: **Pending Payments** (any job with an outstanding balance on a *billed* invoice, plus jobs whose finish is still scheduled/not yet billed) and **Historical Paid** (jobs paid in full). Each row is one job (customer) with separate **Rough-In** and **Finish** columns showing that invoice's amount, a Paid / Partial / Unpaid badge, and the per-invoice **balance still owed** (with "X of it collected" under a partially collected invoice, or the paid date once it is settled), plus a job-level **Total Outstanding** and the earliest receivable date. Row links go to the existing invoicing page (`/quotes/[id]/invoices`) where invoice PDFs are downloaded or payments recorded.

**Receivable model (email-gated finish).** An invoice is "receivable" (billed, counts toward AR) when it is paid, or it is the rough-in (billed at setup), or it has been emailed (a `sent` `email_log` row for that quote + kind). The finish invoice is created at invoice setup but not actually billed until after the sheetrock gap, so before it is emailed (or paid) it is **scheduled** — shown in the Finish column as the amount with a "Scheduled / not yet billed" badge and excluded from the invoiced/outstanding totals. This keeps AR from overstating what is owed right now: a job with a paid rough-in and an unbilled finish shows $0 outstanding and stays in Pending Payments (not Historical Paid), because work is still in progress. The rough-in always counts (it is the current invoice, often handed over in person / collected as cash, not always emailed). The receivable date is the first sent email date, falling back to `paidAt`, then `issuedAt`.

Controls live client-side in `components/receivables-table.tsx`: a preset period filter (All time / This month / Last 30 days / This quarter / This year, scoped by the job's earliest receivable date) and a sort (oldest first / largest outstanding / newest / client). The page (`app/receivables/page.tsx`, `force-dynamic`) queries accepted quotes with `invoice_data` not null, batch-loads the emailed-state via `loadInvoiceReceipts` (one `email_log` query), flattens each into a `ReceivableJob` (reusing `invoiceIsReceivable`, `outstandingCents`, `isPaidInFull`, `receivableInvoicedCents`, `scheduledFinishCents`, `invoiceReference`, plus `invoiceOutstandingCents` for per-invoice balances), and hands them to the table. No new tables or RLS policies. Summary cards at the top show total invoiced, total outstanding (emphasized), and total paid — all counting only receivable invoices.

The same receivable model drives the dashboard's "Awaiting payment" tile + recent-row badges (`app/page.tsx`), the quote pipeline stages (`app/quotes/page.tsx` + `components/dashboard-quote-section.tsx`), and the saved-quote / invoicing page headers ("Outstanding: $X", "Finish pending: $Y", or "Paid in full"). The shared helpers in `lib/invoice-calculations.ts` take an optional `receipts` param; **omitting it preserves the legacy behavior** (every invoice receivable), so `lib/pnl.ts` (the P&L report, which reasons about the full contract) is unchanged.

### Sending email from the app
Each of the four customer-facing printables (Detailed Quote, Summary Quote, Initial Invoice, Finish Invoice) has an **Email PDF** button next to the existing **Download PDF**. It opens a small panel with To / Subject / Message, pre-filled from the customer's email on file (`quote_data.clientEmail`) plus per-doc defaults built by `buildEmailDefaults` in `lib/send-pdf-email.tsx` (no em dashes in the copy). The owner edits any field, then Send posts to `POST /api/email-pdf`.

The endpoint renders the requested PDF to a buffer using the **same** `load*PdfInput` helpers + `renderToBuffer` that the Download PDF routes use, so the emailed attachment is byte-identical to the downloaded one (and matches the on-screen preview). The message body is plain text; the PDF is attached. Internal notes are excluded as on every customer-facing PDF. No new PDF rendering code. The email's **Reply-To** is set to the business email on file (`app_settings.business_email`, e.g. `freedomfamilyelectric@gmail.com`), so customer replies land in the owner's inbox even though the email is sent from the `EMAIL_FROM`/`EMAIL_FROM_INVOICES` address on the verified domain.

Sending goes through **Resend**. One-time setup (owner, before the feature can send to real customers):
1. `npm install` (the `resend` package was added to `package.json`); Vercel installs it automatically on deploy.
2. In Resend, **verify a domain you own** (add the DNS records Resend shows you). Until a domain is verified, Resend only delivers to its own test address (`onboarding@resend.dev`), so the owner can self-test before going live but cannot reach a customer.
3. Add `RESEND_API_KEY` and `EMAIL_FROM` (an address on the verified domain) to Vercel env and `.env.local`. Optionally add `EMAIL_FROM_INVOICES` so invoices send from a separate address; if unset, invoices use `EMAIL_FROM`. Both `EMAIL_FROM` and `EMAIL_FROM_INVOICES` must be on the verified domain (any localpart works once the domain is verified).

**Endpoint is now gated (Phase B).** `/api/email-pdf` requires an admin session — anonymous callers get 401, non-admins 403 (`getServerUser()` in `lib/auth.ts`). The middleware front-door redirect keeps anonymous users off the pages that expose the button. All data access (including the email-log write) now goes through the logged-in session (Phase C2); the legacy wide-open `anon` policies are dropped in Phase C3, after which the database is fully private.

### Email audit trail
Every send through `/api/email-pdf` appends one row to an append-only `email_log` table (in `lib/email-log.ts`, `logEmailSend` is best-effort so a logging failure never breaks a send). The row records the quote, doc type, invoice kind, reference + doc-title snapshots, recipient, subject, the Resend message id, status (`sent`/`failed`), any error, and the timestamp. Both successful and failed sends are logged so the owner can see attempts, not just successes. The `reference`/`doc_title` snapshots + `on delete set null` keep history readable even if the quote row is later deleted.

It surfaces in two places: an **Email History** section on the saved-quote page (`/quotes/[id]`, per-quote, newest first) and a global **Email Log** page (`/email-log`, nav link, 50 most recent sends across all quotes, newest first). Both are read-only; the table is append-only (no update/delete).

**One-time SQL (run in the Supabase SQL Editor before deploying the audit trail):**
```sql
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete set null,
  doc text not null check (doc in ('detailed','summary','invoice')),
  invoice_kind text check (invoice_kind is null or invoice_kind in ('initial','finish')),
  reference text not null default '',
  doc_title text not null default '',
  recipient text not null,
  subject text not null,
  provider_message_id text,
  status text not null default 'sent' check (status in ('sent','failed')),
  error text not null default '',
  sent_at timestamptz not null default now()
);

create index if not exists email_log_quote_idx on public.email_log(quote_id);
create index if not exists email_log_sent_at_idx on public.email_log(sent_at desc);

alter table public.email_log enable row level security;
create policy "Allow browser read email log"  on public.email_log for select to anon using (true);
create policy "Allow browser insert email log" on public.email_log for insert to anon with check (true);
```
No update/delete policies (append-only). These permissive anon policies mirror the rest of the dev posture and **must be tightened** (reads to owner/admin, writes server-side only) alongside the auth/RLS pass.

## Pricing and calculation logic

Pricing and customer-facing text now live in Supabase (not a static file) and are edited through the `/pricing-admin` page. The two builder entry points (`/quotes/new` and `/quotes/[id]/edit`) are async server components that call `getPricingCatalog()` in `lib/pricing.ts` and pass the catalog down into `<QuoteBuilder>`, which threads the items into the picker and the levels/contingencies into `calculateQuote`. The printable Detailed Quote, Summary Quote, and invoice pages call `getSettings()` for business name/email, default quote notes, and invoice payment terms. All of these read live on every request (`force-dynamic` + the shared client's `cache: "no-store"`), so a price change in `/pricing-admin` shows up the next time a quote is started or a printable is opened.

Calculations live in `lib/calculations.ts`. Money is stored in cents; `lib/currency.ts` formats it. The catalog types (`PricingItem`, `PricingLevel`, `ContingencyOption`, `ProjectType`, `AppSettings`, `PricingCatalog`) are in `lib/types.ts`. The built-in base-rate preset fallback ($5-$12, used when the `base_rates` table is empty/missing) is in `lib/base-rates.ts`.

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

create table if not exists public.base_rates (
  id text primary key,
  name text not null,
  rate_cents integer not null default 600,
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
  -- Internal cost-estimate defaults (default material bucket names + default
  -- hourly labor rate). Added by supabase/cost-estimate-columns.sql. Empty
  -- object by default; the app falls back to built-in defaults (Chad's
  -- buckets + $75/hr, lib/cost-estimate.ts) when empty.
  cost_estimate_defaults jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

The `quotes` table also carries a nullable `cost_estimate_data jsonb` column (added by the same `supabase/cost-estimate-columns.sql` migration) holding each job's editable cost estimate (material $ buckets + per-person labor split rough-in / finish). Old quotes have null; the Job P&L page builds a default (the global default buckets at $0 + one blank labor line) on first open and nothing is persisted until the owner saves. Both columns are covered by the existing admin-only policies on `quotes` / `app_settings` (no new RLS). Run `supabase/cost-estimate-columns.sql` once in the Supabase SQL Editor to add both.
Then seed the five tables from the current values (the 41 pricing items, 3 levels, 4 contingencies, 5 project types, and the business info / default quote notes / invoice payment terms that used to live in `lib/seed-data.ts`). Enable RLS. The original build-phase permissive `anon` policies (below) were **dropped in Phase C3** and replaced by `authenticated`/`admin` policies (Phase C1, gated by `public.is_admin()`); they're kept here only as the historical record. Note the policy names embed the specific table name (e.g. `pricing_items`, not a generic `pricing`; `app_settings`, not `settings`) — this is how they actually exist in the database, and dropping by any other name is a silent no-op:
```sql
alter table public.pricing_items       enable row level security;
alter table public.pricing_levels      enable row level security;
alter table public.base_rates          enable row level security;
alter table public.contingency_options enable row level security;
alter table public.project_types       enable row level security;
alter table public.app_settings        enable row level security;

-- Build-phase (SUPERSEDED + dropped in Phase C3; admin policies from C1 now govern these tables.)
create policy "Allow browser insert pricing_items during app build" on public.pricing_items       for insert to anon with check (true);
create policy "Allow browser read pricing_items during app build"   on public.pricing_items       for select to anon using (true);
create policy "Allow browser update pricing_items during app build" on public.pricing_items       for update to anon using (true) with check (true);
create policy "Allow browser insert pricing_levels during app build" on public.pricing_levels      for insert to anon with check (true);
create policy "Allow browser read pricing_levels during app build"   on public.pricing_levels      for select to anon using (true);
create policy "Allow browser update pricing_levels during app build" on public.pricing_levels      for update to anon using (true) with check (true);
create policy "Allow browser insert contingency_options during app build" on public.contingency_options for insert to anon with check (true);
create policy "Allow browser read contingency_options during app build"   on public.contingency_options for select to anon using (true);
create policy "Allow browser update contingency_options during app build" on public.contingency_options for update to anon using (true) with check (true);
create policy "Allow browser insert project_types during app build" on public.project_types       for insert to anon with check (true);
create policy "Allow browser read project_types during app build"   on public.project_types       for select to anon using (true);
create policy "Allow browser update project_types during app build" on public.project_types       for update to anon using (true) with check (true);
create policy "Allow browser insert app_settings during app build" on public.app_settings       for insert to anon with check (true);
create policy "Allow browser read app_settings during app build"  on public.app_settings        for select to anon using (true);
create policy "Allow browser update app_settings during app build" on public.app_settings       for update to anon using (true) with check (true);
```
If the migration is skipped, the builder shows an empty picker plus a "Pricing not configured" banner, and print pages show empty business info. No new policies are needed beyond these dev-permissive anon ones; they must be tightened (and `/pricing-admin` gated to admin) alongside the existing RLS-tightening item before production.

## Supabase setup

Environment variables (set in Vercel, and in `.env.local` for local dev):
```
NEXT_PUBLIC_SUPABASE_URL           // base project URL, e.g. https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          // server-only service-role key (keepalive + future Stripe webhook + public /pay page reads); never NEXT_PUBLIC_
RESEND_API_KEY                     // Resend API key (server-only, used by /api/email-pdf)
EMAIL_FROM                         // RFC "From" for quotes (server-only), on a Resend-verified domain,
                                   //   e.g. "Freedom Family Electric <quotes@yourdomain.com>"
EMAIL_FROM_INVOICES                // (optional) RFC "From" for invoices, e.g.
                                   //   "Freedom Family Electric <invoices@yourdomain.com>".
                                   //   If unset, invoices fall back to EMAIL_FROM.
APP_URL                            // public origin of the site, e.g. https://admin.freedomfamilyelectric.com (server-only; used to build absolute pay links)
PAY_LINK_SECRET                    // server-only random string (>= 32 chars; `openssl rand -hex 32`). Signs the customer pay-link tokens. Rotating it invalidates all outstanding pay links.
STRIPE_SECRET_KEY                  // (step 3) server-only Stripe secret key; until set, online payment shows "being set up"
STRIPE_WEBHOOK_SECRET              // (step 3) signing secret for the Stripe webhook endpoint (from the dashboard when you register /api/stripe-webhook)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY // (step 3) Stripe publishable key (safe for the browser)
```
The Supabase URL is the base project URL, **not** the REST endpoint. The `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_FROM_INVOICES` vars are server-only (no `NEXT_PUBLIC_` prefix) and are only needed once the email feature is enabled. Quotes (Detailed + Summary) send from `EMAIL_FROM`; invoices (Initial + Finish) send from `EMAIL_FROM_INVOICES` when set, otherwise `EMAIL_FROM`. See **Sending email from the app** below.

### One-time SQL migrations (run in the Supabase SQL Editor)

Service-call quote type (run once before deploying the service-call feature):
```sql
alter table public.quotes add column if not exists quote_type text not null default 'new_build';

-- Widen the two invoice_kind check constraints so 'service' is allowed.
alter table public.payments drop constraint if exists payments_invoice_kind_check;
alter table public.payments add constraint payments_invoice_kind_check
  check (invoice_kind in ('initial','finish','service'));

alter table public.email_log drop constraint if exists email_log_invoice_kind_check;
alter table public.email_log add constraint email_log_invoice_kind_check
  check (invoice_kind is null or invoice_kind in ('initial','finish','service'));
```
Verify the actual constraint names before dropping (the README documents both check clauses). No new table, no new RLS — writes go to `quotes` (already admin-only under Phase C). Old quotes default to `new_build` and resolve exactly as before.

Partial payments (run once before deploying partial payments):
```sql
alter table public.payments add column if not exists note text not null default '';
```
The `note` column holds the optional note typed when a payment is recorded ("Check #1043, stalled project"). The `invoice_kind` widening above (the `payments` one) covers the same invoices this feature touches, so run it too if it was not already applied; it is idempotent. Safe to re-run.

(See also the earlier one-time SQL blocks: `invoice_data` jsonb column, `payments` table, `project_status` jsonb, `project_name` column, `base_rates` table, `customers` table, `invoice_sequences` + `next_invoice_number()`.)

### Supabase keepalive (prevent free-tier pause)

Supabase pauses a free-tier project after 7 days of no inbound activity. A daily GitHub Actions cron pings `GET /api/keepalive`, which runs one trivial Supabase query so the project counts as active and is not paused. Scheduled workflows run only on the default branch, so this is effective only when committed to `main`.

- The route is `app/api/keepalive/route.ts` (public, unauthenticated, counts rows only). The cron is `.github/workflows/keepalive.yml` (runs ~08:17 UTC daily; also runnable on demand from the Actions tab).
- **No setup required.** The production URL (`https://admin.freedomfamilyelectric.com`) is hardcoded in the workflow, so it runs with zero configuration. If the URL ever changes, update `APP_URL` in `.github/workflows/keepalive.yml`.
- You can see every run (and any failures) under the repo's **Actions** tab → "Supabase keepalive". A failed ping shows a red X; a paused/healthy Supabase project is the first thing to check if it goes red.

### Supabase Auth (owner/admin login) — in progress

Login is being added in four low-risk phases so the live app keeps working between each. Phases A, B, C are **live and complete**: you must sign in to use the app, the email endpoint is gated to admins, all data access goes through the logged-in session (the authenticated server + browser clients), and the legacy wide-open `anon` policies have been dropped — so the **database is fully private** (anonymous direct access is denied; only a logged-in admin can read/write quotes, pricing, invoices, email log, and settings; any logged-in user can read the schedule). Phase D (role-gate confirmation) is a paper review remaining.

**Roles:** `admin` (the owner + business owner — full access) and `team_member` (crew; schedule-only, wired in a later phase). Role is stored in each user's `app_metadata` (set in the Supabase dashboard, signed into the JWT) so it can't be self-edited; `lib/auth.ts` reads it via `getServerUser()`, and the database's RLS reads the same field via a `public.is_admin()` security-definer function (added in C1) so server-side gates and database-level rules always agree. Auth-aware clients (Phase A): `lib/supabase-env.ts` / `lib/supabase-browser.ts` / `lib/supabase-server.ts`; `middleware.ts` refreshes the session on every request and redirects unauthenticated users to `/login`.

- **Phase A (done):** auth infrastructure + login + logout. App stayed fully open; login worked but was optional.
- **Phase B (done):** middleware redirects unauthenticated users to `/login` (except public routes: `/login`, `/pay/*`, `/api/keepalive`, `/api/stripe-webhook`); `POST /api/email-pdf` is gated to an admin session (401/403). The app requires sign-in.
- **Phase C1 (done):** added `authenticated`/`admin` RLS policies alongside the existing `anon` ones (via `public.is_admin()`), and granted `next_quote_id` to authenticated. No code deploy; app kept working on the anon policies. SQL: `supabase/phase-c-1-add-policies.sql`.
- **Phase C2 (done):** switched all data access from the bare anon client to the logged-in session — server pages + the pricing/email-log/PDF libs use `getSupabaseServer()` (per-request, RLS-enforced), client components + `lib/quote-id` use `getSupabaseBrowser()` (session-carrying singleton), and the keepalive route uses a new service-role client `lib/supabase-admin.ts` (no user session; bypasses RLS). `lib/schedule` was split into a shared types/helpers module (`lib/schedule.ts`) plus `lib/schedule-server.ts` and `lib/schedule-client.ts` wrappers, so `cookies()`/`next/headers` never lands in a client bundle. The bare anon client `lib/supabase.ts` was removed. Anon policies still exist, so the app kept working throughout. Requires the `SUPABASE_SERVICE_ROLE_KEY` env var on Vercel.
- **Phase C3 (done):** dropped the legacy `anon` policies so the database is fully private (anonymous direct access is denied), and revoked the anon grant on `next_quote_id`. The first pass (`supabase/phase-c-3-drop-anon-policies.sql`) dropped them by name and missed 14 on the pricing tables + `app_settings` because their real DB names embed the table name and didn't match the README-documented names (a silent no-op); `supabase/phase-c-3b-drop-remaining-anon.sql` finished the job by reading `pg_policies` and dropping every anon policy in the public schema directly. Verified: zero `{anon}` rows in `pg_policies`. Rollback (if ever needed): `supabase/phase-c-rollback-re-add-anon.sql`.
- **Phase D:** confirm role gates (employees excluded from quotes/pricing/receivables/email-log automatically; admin full access incl delete + reopen).

**One-time Supabase setup (Phase A):**
1. Supabase dashboard → **Authentication → Providers → Email**: enable Email, ensure "Confirm email" is off for now (or confirm the users manually), and allow `freedomfamilyelectric@gmail.com` + `glwalke17@gmail.com`.
2. **Authentication → Users → Add user**: create the two admin users (email + a password you choose). Send the password to the business owner out-of-band.
3. Set each user's role: for each user, **Authentication → Users → (user) → ... → set `app_metadata`** to `{ "role": "admin" }` (via the dashboard user panel or a one-time SQL update — see below). Without this, `getServerUser()` defaults to `team_member`.
4. Test: visit `/login`, sign in, land on `/`; a Logout button is in the header.

```sql
-- Set the admin role on the two admin users (run once in the Supabase SQL Editor).
-- Replace the emails if needed.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email in ('freedomfamilyelectric@gmail.com', 'glwalke17@gmail.com');
```

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

`quote_id` is unique per quote. The server-side sequence guarantees no two auto-generated IDs collide; the unique constraint is the database-level guard (it predates the read-only field, when the owner could type a custom ID that might clash with a past or future `Q-YYYYMMDD-NNN`). Run once in the Supabase SQL Editor — first confirm there are no existing duplicates, then add the constraint:
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

The quote ID is a daily sequence (`Q-YYYYMMDD-NNN`) assigned at save time via a Postgres function that atomically increments a per-day counter, so two people saving at the same instant can never collide. The builder's Quote ID field is read-only (placeholder "Assigned on save") until the quote is actually saved; manual entry was removed on 2026-08-11, so a new quote always mints a system number. Editing a saved quote keeps its existing ID (the read-only field is prefilled with it and passed back through). The function is a `security definer` function that atomically increments the counter via `INSERT ... ON CONFLICT ... RETURNING` and returns the formatted ID. It bypasses RLS on the counter table, so the table itself has no policies (direct anon access is denied; only the function can touch it). Run once in the Supabase SQL Editor before deploying the sequencing:

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

The owner schedules his crew (Adam, Johnathan full-time; Peyton intern) onto rough-in and finish jobs for accepted quotes, plus free-form entries (service calls, warranty visits, supply runs) that have no quote. `crew` is a small editable list (managed under Pricing → Crew; deactivate instead of delete so past schedules keep their label). An assignment can carry **one or more** crew members (so two people can be sent to one job), tracked through the `schedule_assignment_crew` join table — `schedule_assignments` itself holds no crew column. `quote_id` and `phase` are both optional (null = a free-form/service-call entry with no phase), and `title`/`location` are always stored on the assignment as an editable snapshot, so editing them never touches the quote and deleting a quote (`on delete set null`) never wipes schedule history. Only `work_date` is required (plus at least one crew via the join table). Run once in the Supabase SQL Editor:
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

-- One row per (assignment, crew). An assignment can have several crew members.
create table if not exists public.schedule_assignment_crew (
  assignment_id uuid not null references public.schedule_assignments(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  primary key (assignment_id, crew_id)
);

create index if not exists schedule_assignments_work_date_idx on public.schedule_assignments(work_date);
create index if not exists schedule_assignments_quote_idx on public.schedule_assignments(quote_id);
create index if not exists schedule_assignment_crew_crew_idx on public.schedule_assignment_crew(crew_id);

alter table public.crew enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.schedule_assignment_crew enable row level security;

create policy "Allow browser read crew"  on public.crew for select to anon using (true);
create policy "Allow browser insert crew" on public.crew for insert to anon with check (true);
create policy "Allow browser update crew" on public.crew for update to anon using (true) with check (true);
create policy "Allow browser delete crew" on public.crew for delete to anon using (true);

create policy "Allow browser read assignments"  on public.schedule_assignments for select to anon using (true);
create policy "Allow browser insert assignments" on public.schedule_assignments for insert to anon with check (true);
create policy "Allow browser update assignments" on public.schedule_assignments for update to anon using (true) with check (true);
create policy "Allow browser delete assignments" on public.schedule_assignments for delete to anon using (true);

create policy "Allow browser read assignment crew"  on public.schedule_assignment_crew for select to anon using (true);
create policy "Allow browser insert assignment crew" on public.schedule_assignment_crew for insert to anon with check (true);
create policy "Allow browser update assignment crew" on public.schedule_assignment_crew for update to anon using (true) with check (true);
create policy "Allow browser delete assignment crew" on public.schedule_assignment_crew for delete to anon using (true);
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

If you ran an earlier version of this schema (where `schedule_assignments` had a single `crew_id` column), migrate to the join table with:
```sql
create table if not exists public.schedule_assignment_crew (
  assignment_id uuid not null references public.schedule_assignments(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  primary key (assignment_id, crew_id)
);

-- Move each existing crew assignment into the join table.
insert into public.schedule_assignment_crew (assignment_id, crew_id)
  select id, crew_id from public.schedule_assignments where crew_id is not null
  on conflict do nothing;

create index if not exists schedule_assignment_crew_crew_idx on public.schedule_assignment_crew(crew_id);

alter table public.schedule_assignment_crew enable row level security;
create policy "Allow browser read assignment crew"  on public.schedule_assignment_crew for select to anon using (true);
create policy "Allow browser insert assignment crew" on public.schedule_assignment_crew for insert to anon with check (true);
create policy "Allow browser update assignment crew" on public.schedule_assignment_crew for update to anon using (true) with check (true);
create policy "Allow browser delete assignment crew" on public.schedule_assignment_crew for delete to anon using (true);

-- Drop the now-redundant column and its index.
drop index if exists public.schedule_assignments_crew_date_idx;
alter table public.schedule_assignments drop column if exists crew_id;
```

## Branding

- Logo: `public/ffe-logo.png` (use this one, not older circular badge logos).
- Business email: freedomfamilyelectric@gmail.com
- Color palette and Tailwind tokens (see `tailwind.config.ts`): pine, deep-pine, moss, sage, clay, sand, cream, stone, charcoal, whitewarm. Radii: `rounded-xl2`, `rounded-xl1`, `rounded-soft`. Shadows: `shadow-soft`, `shadow-card`. Headings use `font-display`.
- Design feel: warm, professional, clean, residential contractor, slightly premium, rounded cards and buttons, earthy palette.
- Writing style: clear, professional, no unnecessary jargon, **no em dashes** in app copy.

### App shell / navigation
`components/app-shell.tsx` is the server component every authenticated page is wrapped in. The header is intentionally minimal: the FFE brand/logo on the left, a "+ New Quote" button, and a **Menu** button on the right. The full tool list lives in a slide-out panel (`components/nav-menu.tsx`, client): clicking Menu slides a 320px (max 86vw) panel in from the right, grouped **Work** (Dashboard, Quotes, Customers, Schedule, Projects) / **Money** (Receivables, P&L, Email Log) / **Setup** (Pricing Admin), each item with an icon and a one-line description, and a Sign out at the bottom. The active tool is highlighted from `usePathname()`. The panel closes on Escape, on backdrop click, and on navigating to a tool; body scroll is locked while open. This replaced an older header that crammed every tool into a single row of links, which ran out of room as tools were added. (The original nav mockup is at `/tmp/ffe-mockups/mockup-nav.html`; Customers and Projects have since joined the Work group.) `LogoutButton` accepts an optional `className` so the nav foot restyles it full-width.

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

The app is live and in daily use. It runs on Next.js 14, Supabase (Postgres, Auth, admin-only RLS), Tailwind, and Vercel.

### What it does

- **Three document types.** New Build (catalog quote with a per-sqft base rate, pricing level, contingency, and per-line overrides), Service Call / Other (freeform qty x price lines, optional Deposit + Final split), and Direct Invoice (an invoice with no quote).
- **Quotes.** Saved to Supabase with `Q-YYYYMMDD-NNN` ids. New builds move Draft → Prepared → Client Accepted → Pending Payments → Paid in Full; service calls move Quote → Accepted → Scheduled → Paid.
- **Invoices.** Editable line items seeded once from the quote, then independent. New builds split rough-in and finish with an optional permit; service calls bill once or split Deposit and Final. Each invoice gets its own `INV-NNNN`.
- **Payments.** Any invoice can be paid in pieces. The `payments` ledger records amount, date, method, note, and who recorded it. Stripe card and ACH are live; the public signed pay link charges only the balance.
- **Money rules.** Once invoicing starts, the quote is a point-in-time snapshot and the invoice is the living copy. A paid rough-in or deposit is frozen; later changes flow to the finish or final.
- **Collections.** `/receivables` follows a billed-only model: a finish or service invoice is owed once it is emailed or paid, not the moment it is set up. The period filter drives the headline totals and the tables together.
- **Operations.** `/projects` (8-stage new-build and 5-stage service tracker), `/schedule` (multi-crew week board), `/customers` (shared records with multiple emails), `/pnl` (job cost estimator and P&L), `/email-log` (every send), `/pricing-admin` (live catalog).
- **Reports.** `/reports` has three switchable layouts (one screen, compare first, report builder) over one shared dataset. Filters change the KPIs, charts, and tables together, with month/quarter/year grouping and prior-period comparison. Export CSV writes the selected grouping.
- **Email.** Quote and invoice PDFs are rendered server-side and sent through Resend. The To field accepts multiple customer emails.
- **Type.** Inter Tight across the whole UI, headings and body. PDF headings use Helvetica-Bold.

### Pending

1. Customer payment receipt email after a Stripe payment. The webhook records the money but sends the customer no confirmation.
2. Invoice email: drop the "or ACH" wording for invoices over the `ACH_LIMIT_CENTS` cap, where ACH is not offered.
3. Auth Phase D: confirm the owner/admin role gates once employee accounts exist.
4. Customer "accept" link in the emailed quote, replacing the manual Mark accepted step.
5. Flexible job-type invoice model (more than two invoices). Deferred until the per-job-type billing flows are agreed.
6. Review this list on every change and remove what is done.

### Design references

- **Reports.** Built at `/reports` with all three layouts. The static mockup stays at `mockups/reporting-mockups.html` for layout comparison.
- **Type.** `mockups/font-options.html` and `mockups/sans-options.html` are kept as reference. Inter Tight was chosen and is applied across the app.

### Documentation

- `README.md` (this file): routes, data model, money rules, and the pending list.
- `CHANGELOG.md`: dated work history and the archive of completed capabilities.
- `mockups/`: static HTML design mockups, not part of the app build.
