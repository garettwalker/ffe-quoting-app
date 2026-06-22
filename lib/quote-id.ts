import { supabase } from "@/lib/supabase";

// The quote id is left blank in the builder until the quote is actually saved.
// The real daily-sequence number (Q-YYYYMMDD-NNN) is assigned at save time, so
// two people saving at the same instant can never collide on the same id. The
// owner can still type a custom id into the builder; a non-blank value is used
// as-is and the server is not asked for one.
//
// The day prefix is taken from the quote's own quote_date (NOT the database
// now()), so a quote's id prefix and its quote_date always agree, even if the
// owner backdates the quote or saves a tab that was left open across midnight.
//
// The server side is a Postgres function `next_quote_id(p_day)` (see the SQL in
// the README) that atomically increments a per-day counter (keyed by that day)
// via INSERT ... ON CONFLICT ... RETURNING and returns the formatted id.
// Reserving at save time (not when the builder opens) means abandoned builder
// sessions never waste a number.

// Convert a "YYYY-MM-DD" quote date (from a date input or a toISOString slice)
// to the "YYYYMMDD" day key the counter is keyed by. Falls back to today (UTC)
// when the date is missing or malformed, so a save never blocks on a bad date.
function toDayKey(quoteDate: string): string {
  const cleaned = (quoteDate ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleaned);
  if (match) return `${match[1]}${match[2]}${match[3]}`;
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// Returns the quote id to persist for this save. If the owner typed a custom
// id, use it as-is. Otherwise ask the server for the next atomic daily number
// for the quote's own date. Throws on RPC failure so the caller can surface a
// save error instead of persisting a blank/placeholder id (quote_id is NOT NULL).
export async function resolveQuoteIdForSave(
  currentId: string,
  quoteDate: string
): Promise<string> {
  const trimmed = currentId.trim();
  if (trimmed) return trimmed;

  const day = toDayKey(quoteDate);
  const { data, error } = await supabase.rpc("next_quote_id", { p_day: day });
  if (error || !data) {
    throw new Error(
      `Could not assign a quote ID: ${error?.message ?? "unknown error"}`
    );
  }
  return data as string;
}