"use client";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so the next_invoice_number RPC enforces RLS (admin-only after the
// Phase C pass). Used only by the client invoice builder, so it is a client
// module. Mirrors lib/quote-id.ts.
const supabase = getSupabaseBrowser();

// Returns the next sequential invoice number (INV-NNNN) from a Postgres
// function `next_invoice_number()` (SQL given in the README / chat) that
// atomically increments a one-row global counter via
// INSERT ... ON CONFLICT ... RETURNING, so two setups saved at the same
// instant can never be handed the same number. Called once per invoice record
// that does not already have a number (a brand-new setup mints two: the
// initial then the finish).
//
// Honesty notes (same caveats as next_quote_id):
//  - The RPC is invoked from the browser using the authenticated session.
//    The increment is atomic in Postgres.
//  - The number is reserved BEFORE the invoice_data write. A save that fails
//    after the RPC increments (network error, RLS denial) will have already
//    advanced the counter, so failed saves can leave gaps. Gaps are normal and
//    acceptable in real invoice numbering. Re-saving an already-numbered
//    setup never calls this (it keeps its existing numbers), so editing does
//    not burn gaps.
// Throws on failure so the caller can surface a save error instead of
// persisting a blank number.
export async function nextInvoiceNumber(): Promise<string> {
  const { data, error } = await supabase.rpc("next_invoice_number");
  if (error || !data) {
    throw new Error(
      `Could not assign an invoice number: ${error?.message ?? "unknown error"}`
    );
  }
  return data as string;
}