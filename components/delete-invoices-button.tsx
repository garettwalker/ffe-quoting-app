"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes after the Phase C pass.
const supabase = getSupabaseBrowser();

type DeleteInvoicesButtonProps = {
  quoteId: string;
  // True when any invoice on the job is flagged paid, OR any payment ledger
  // row exists for the job (card / ACH / manual). A paid invoice is a financial
  // record, so clearing the invoice setup is blocked in that case — the payment
  // audit trail must not be orphaned. The page computes both server-side.
  blocked: boolean;
  blockedReason: string;
};

// Lets the owner clear the two-invoice setup (nulls quotes.invoice_data) while
// keeping the quote itself. The quote stays accepted; with no invoice_data the
// derived lifecycle auto-returns to "Client Accepted" so the setup can be
// redone. Mirrors the confirm pattern of DeleteQuoteButton. Guarded: a job with
// a paid invoice or any payment ledger row cannot be cleared this way.
export function DeleteInvoicesButton({
  quoteId,
  blocked,
  blockedReason
}: DeleteInvoicesButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleDelete() {
    setIsDeleting(true);
    setErrorMessage("");

    // Null out invoice_data on the quote row. The quote itself (and its
    // payments ledger rows, which reference quotes(id) on delete cascade only
    // when the WHOLE quote is deleted) are untouched. With invoice_data null,
    // lifecycleStage recomputes to "Client Accepted" on the next read.
    const { error } = await supabase
      .from("quotes")
      .update({ invoice_data: null, updated_at: new Date().toISOString() })
      .eq("id", quoteId);

    if (error) {
      setErrorMessage(`Delete failed: ${error.message}`);
      setIsDeleting(false);
      setConfirming(false);
      return;
    }

    // Stay on the invoicing page; it re-renders into the "no invoices yet"
    // state because invoice_data is now null.
    router.refresh();
  }

  if (blocked) {
    return (
      <div className="rounded-xl1 border border-clay/20 bg-cream/60 p-4">
        <p className="text-sm font-black text-clay">Delete invoices</p>
        <p className="mt-1 text-sm font-bold leading-6 text-charcoal/70">
          {blockedReason}
        </p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-clay/25 px-5 py-3 font-black text-clay hover:bg-clay hover:text-whitewarm"
      >
        Delete invoices
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl1 border border-clay/25 bg-cream/70 p-4">
      <p className="text-sm font-black text-clay">
        Delete the invoice setup for this quote?
      </p>
      <p className="text-sm font-bold leading-6 text-charcoal/70">
        This clears both invoices (rough-in and final) and the line-item / split
        / permit setup. The quote itself is kept. The job moves back to Client
        Accepted with no invoices, so you can set them up again. This cannot be
        undone.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-full bg-clay px-5 py-3 font-black text-whitewarm hover:bg-clay/90 disabled:opacity-60"
        >
          {isDeleting ? "Deleting..." : "Yes, delete invoices"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isDeleting}
          className="rounded-full border border-pine/20 px-5 py-3 font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          Cancel
        </button>
      </div>
      {errorMessage ? (
        <p className="break-words text-sm font-bold text-clay">{errorMessage}</p>
      ) : null}
    </div>
  );
}