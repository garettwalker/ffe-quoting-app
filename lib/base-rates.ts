import type { BaseRate } from "@/lib/types";

// Built-in fallback base-rate presets, used by the quote builder when the
// `base_rates` Supabase table is empty or missing (e.g. the one-time
// `supabase/base-rates-table.sql` migration hasn't been run yet, or a fresh
// environment hasn't seeded it). These mirror the SQL seed EXACTLY (same ids,
// names, rateCents, sortOrder) so a quote that adopts a built-in preset keeps
// the same id once the table is seeded and the DB rows take over as source of
// truth. The DB always wins when it has any rows; this list is only a floor so
// the Base Rate dropdown is never empty.
//
// Kept in its own module (no server imports) so the client-side quote builder
// can import it without pulling `lib/pricing.ts`'s server-only Supabase client
// into the browser bundle. Pricing Admin does NOT use this fallback — it shows
// the real DB state so the owner sees when the table needs seeding.
export const DEFAULT_BASE_RATES: BaseRate[] = [
  { id: "base-rate-5", name: "Economy / simple", rateCents: 500, active: true, sortOrder: 0 },
  { id: "base-rate-6", name: "Standard", rateCents: 600, active: true, sortOrder: 1 },
  { id: "base-rate-7", name: "Upgraded", rateCents: 700, active: true, sortOrder: 2 },
  { id: "base-rate-8", name: "Big complex / all-in", rateCents: 800, active: true, sortOrder: 3 },
  { id: "base-rate-9", name: "Large complex", rateCents: 900, active: true, sortOrder: 4 },
  { id: "base-rate-10", name: "Premium", rateCents: 1000, active: true, sortOrder: 5 },
  { id: "base-rate-11", name: "High-end", rateCents: 1100, active: true, sortOrder: 6 },
  { id: "base-rate-12", name: "Luxury / custom", rateCents: 1200, active: true, sortOrder: 7 }
];