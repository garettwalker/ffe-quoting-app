import { supabase } from "@/lib/supabase";

// The quote id is left blank in the builder until the quote is actually saved.
// The owner can type a custom id into the builder; a non-blank value is used
// as-is and the server is not asked for one.
//
// For a brand-new quote with a blank id, the daily-sequence number
// (Q-YYYYMMDD-NNN) comes from a Postgres function `next_quote_id(p_day)` (see
// the SQL in the README) that atomically increments a per-day counter via
// INSERT ... ON CONFLICT ... RETURNING, so two people saving at the same
// instant can never be handed the same number. The day prefix is the quote's
// own quote_date (NOT the database now()), so a quote's id prefix and its
// quote_date always agree, even if the owner backdates the quote or saves a
// tab that was left open across midnight.
//
// Honesty notes on "server-side" and "no gaps":
//  - The RPC is invoked from the browser using the public anon key, not from an
//    authenticated server action. The *increment* is atomic in Postgres, but
//    until auth/RLS tightening lands anyone with the anon key can call
//    `next_quote_id` in a loop and burn arbitrary gaps. Moving the call behind
//    an authenticated server action is part of the pending hardening pass.
//  - The number is reserved BEFORE the quote row is written. A save that fails
//    after the RPC increments (network error, RLS denial, constraint violation)
//    will have already advanced the counter, so failed saves can leave gaps.
//    Abandoned builder sessions (closed before Save is clicked) do NOT burn a
//    number, and editing a saved quote keeps its existing id (see below).

// Convert a "YYYY-MM-DD" quote date (from a date input or a toISOString slice)
// to the "YYYYMMDD" day key the counter is keyed by. Falls back to today (UTC)
// when the date is missing or malformed, so a save never blocks on a bad date.
function toDayKey(quoteDate: string): string {
  const cleaned = (quoteDate ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleaned);
  if (match) return `${match[1]}${match[2]}${match[3]}`;
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// Returns the quote id to persist for this save:
//  - If the owner typed a custom id (currentId non-blank), use it as-is.
//  - Else if `existingRowId` is set (we are updating an already-saved quote and
//    the id field was cleared), keep that row's existing quote_id instead of
//    minting a new number. Clearing the field on an edit is not "give me a new
//    id" — a saved quote already has a client-facing reference that should not
//    change unless the owner types a new custom one explicitly.
//  - Else (a brand-new quote with a blank id), ask the server for the next
//    atomic daily number for the quote's own date.
// Throws on failure so the caller can surface a save error instead of
// persisting a blank/placeholder id (quote_id is NOT NULL).
export async function resolveQuoteIdForSave(
  currentId: string,
  quoteDate: string,
  existingRowId?: string | null
): Promise<string> {
  const trimmed = currentId.trim();
  if (trimmed) return trimmed;

  const rowId = (existingRowId ?? "").trim();
  if (rowId) {
    const { data, error } = await supabase
      .from("quotes")
      .select("quote_id")
      .eq("id", rowId)
      .single();
    if (error || !data) {
      throw new Error(
        `Could not keep the existing quote ID: ${error?.message ?? "unknown error"}`
      );
    }
    return (data as { quote_id: string }).quote_id;
  }

  const day = toDayKey(quoteDate);
  const { data, error } = await supabase.rpc("next_quote_id", { p_day: day });
  if (error || !data) {
    throw new Error(
      `Could not assign a quote ID: ${error?.message ?? "unknown error"}`
    );
  }
  return data as string;
}