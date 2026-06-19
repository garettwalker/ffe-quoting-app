import { supabase } from "@/lib/supabase";

// The quote id is left blank in the builder until the quote is actually saved.
// The real daily-sequence number (Q-YYYYMMDD-NNN) is assigned by the server at
// save time, so two people saving at the same instant can never collide on the
// same id. The owner can still type a custom id into the builder; a non-blank
// value is used as-is and the server is not asked for one.
//
// The server side is a Postgres function `next_quote_id()` (see the SQL in the
// README) that atomically increments a per-day counter via
// INSERT ... ON CONFLICT ... RETURNING. Reserving at save time (not when the
// builder opens) means abandoned builder sessions never waste a number, so the
// client-facing ids have no gaps.

// Returns the quote id to persist for this save. If the owner typed a custom
// id, use it as-is. Otherwise ask the server for the next atomic daily number.
// Throws on RPC failure so the caller can surface a save error instead of
// persisting a blank/placeholder id (the quote_id column is NOT NULL).
export async function resolveQuoteIdForSave(currentId: string): Promise<string> {
  const trimmed = currentId.trim();
  if (trimmed) return trimmed;

  const { data, error } = await supabase.rpc("next_quote_id");
  if (error || !data) {
    throw new Error(
      `Could not assign a quote ID: ${error?.message ?? "unknown error"}`
    );
  }
  return data as string;
}