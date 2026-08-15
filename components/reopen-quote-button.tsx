"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes after the Phase C pass.
const supabase = getSupabaseBrowser();

type ReopenQuoteButtonProps = {
  quoteId: string;
  hasInvoices: boolean;
  hasPaidInvoice: boolean;
  paymentCount: number;
};

// Moves an accepted quote back to "prepared" so it can be edited in the quote
// builder. This is a backward status move, so it is gated by a confirm dialog
// with a warning tailored to the job's financial state:
// - No invoices: a light "the status moves back to Prepared" note.
// - Invoices set up but none paid: warns that the dashboard will show
//   "Prepared" instead of "Pending Payments" (the invoices stay on the quote).
// - Any paid invoice or recorded payment: the loudest warning, because
//   reopening makes a paid job look un-invoiced on the dashboard while the
//   payment records stay in place. Never a hard block (the owner may
//   legitimately need to reopen), but never a silent one-click slip either.
//
// Replaces the generic QuoteStatusButton only for this one transition. The
// generic button stays in place for safe forward moves (Prepare, Mark
// accepted) and the low-risk prepared-to-draft move.
export function ReopenQuoteButton({
  quoteId,
  hasInvoices,
  hasPaidInvoice,
  paymentCount
}: ReopenQuoteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const hasMoney = hasPaidInvoice || paymentCount > 0;

  const warning = hasMoney
    ? "Heads up: this job has paid invoices and/or recorded payments. Reopening to prepared keeps all payment records in place, but the dashboard will show it as Prepared, so a paid job will look un-invoiced. Continue only if you understand this."
    : hasInvoices
      ? "This quote has invoices set up. Reopening to prepared keeps the invoices on the quote, but the dashboard will show it as Prepared instead of Pending Payments."
      : "Reopen this accepted quote back to prepared so you can edit it? The status moves back to Prepared.";

  async function handleReopen() {
    setIsWorking(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("quotes")
      .update({ status: "prepared", updated_at: new Date().toISOString() })
      .eq("id", quoteId);

    setIsWorking(false);

    if (error) {
      setErrorMessage(`Reopen failed: ${error.message}`);
      return;
    }

    router.refresh();
  }

  if (!confirming) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine shadow-card transition hover:bg-pine hover:text-whitewarm"
        >
          Reopen as prepared
        </button>
        {errorMessage ? (
          <p className="text-sm font-bold leading-5 text-clay">
            {errorMessage}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl1 border border-clay/25 bg-cream/70 p-4">
      <p className="text-sm font-black text-clay">Reopen as prepared?</p>
      <p className="text-sm font-bold leading-6 text-charcoal/70">
        {warning}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleReopen}
          disabled={isWorking}
          className="rounded-full bg-clay px-5 py-3 font-black text-whitewarm hover:bg-clay/90 disabled:opacity-60"
        >
          {isWorking ? "Reopening..." : "Yes, reopen to prepared"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isWorking}
          className="rounded-full border border-pine/20 px-5 py-3 font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          Cancel
        </button>
      </div>
      {errorMessage ? (
        <p className="break-words text-sm font-bold text-clay">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}