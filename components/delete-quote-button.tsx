"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes after the Phase C pass.
const supabase = getSupabaseBrowser();

type DeleteQuoteButtonProps = {
  quoteId: string;
  // The job display name shown in the page H1. When the quote has financial
  // state (invoices / payments), deletion is locked behind a type-to-confirm
  // step that requires typing this exact name — so a paid job can never be
  // wiped by a fat-finger click. The page passes the same string the user sees.
  jobName: string;
  hasInvoices: boolean;
  hasPaidInvoice: boolean;
  paymentCount: number;
};

// Hard-deletes a quote. Tiered by financial state:
// - No invoices and no payments: the simple two-step confirm ("Delete Quote"
//   then "Yes, Delete"). This is the old behavior, kept for plain drafts so
//   cleanup stays quick.
// - Invoices set up or any payment recorded: a locked notice first (so the
//   danger is obvious), then an "Unlock delete" step, then a type-the-job-name
//   confirmation. The final "Yes, delete permanently" button is disabled until
//   the typed name matches (trimmed, case-insensitive). Deleting cascades to
//   the payments ledger rows (payments.quote_id references quotes(id) on
//   delete cascade), so a paid job's audit trail is erased with it. The extra
//   steps make sure that only happens on purpose.
export function DeleteQuoteButton({
  quoteId,
  jobName,
  hasInvoices,
  hasPaidInvoice,
  paymentCount
}: DeleteQuoteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Financial state present when invoices are set up OR any payment ledger row
  // exists. hasPaidInvoice implies hasInvoices, so it is covered here.
  const protectedJob = hasInvoices || paymentCount > 0;

  const lockReason = paymentCount > 0
    ? `This job has ${paymentCount} recorded payment${
        paymentCount === 1 ? "" : "s"
      } in the ledger. Deleting the quote permanently erases the payment audit trail along with the quote.`
    : hasPaidInvoice
      ? "This job has a paid invoice. Deleting the quote permanently erases that financial record."
      : hasInvoices
        ? "This job has invoices set up. Deleting the quote permanently erases the invoice setup along with the quote."
        : "";

  async function handleDelete() {
    setIsDeleting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("quotes")
      .delete()
      .eq("id", quoteId);

    if (error) {
      setErrorMessage(`Delete failed: ${error.message}`);
      setIsDeleting(false);
      setConfirming(false);
      setUnlocked(false);
      setTyped("");
      return;
    }

    router.push("/");
    router.refresh();
  }

  // --- Unprotected path: simple two-step confirm (unchanged behavior) -----

  if (!protectedJob) {
    if (!confirming) {
      return (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full border border-clay/25 px-5 py-3 font-black text-clay hover:bg-clay hover:text-whitewarm"
        >
          Delete Quote
        </button>
      );
    }

    return (
      <div className="grid gap-3 rounded-xl1 border border-clay/25 bg-cream/70 p-4">
        <p className="text-sm font-black text-clay">
          Delete this quote permanently?
        </p>
        <p className="text-sm font-bold text-charcoal/70">
          This removes it from the database and cannot be undone.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-full bg-clay px-5 py-3 font-black text-whitewarm hover:bg-clay/90 disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Yes, Delete"}
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
          <p className="break-words text-sm font-bold text-clay">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  // --- Protected path: locked notice -> unlock -> type to confirm ---------

  // The confirm button is enabled only when the typed name matches the job
  // name (trimmed + case-insensitive, so whitespace/capitalization don't trip
  // it, but you still have to read and type the actual name).
  const nameMatches =
    typed.trim().toLowerCase() === jobName.trim().toLowerCase();

  if (!unlocked) {
    return (
      <div className="grid gap-3 rounded-xl1 border border-clay/20 bg-cream/60 p-4">
        <p className="text-sm font-black text-clay">Delete is locked</p>
        <p className="text-sm font-bold leading-6 text-charcoal/70">
          {lockReason}
        </p>
        <p className="text-sm font-bold leading-6 text-charcoal/70">
          To delete anyway, unlock and confirm by typing the job name. This
          cannot be undone.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setUnlocked(true)}
            className="rounded-full border border-clay/25 px-5 py-3 font-black text-clay hover:bg-clay hover:text-whitewarm"
          >
            Unlock delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl1 border border-clay/25 bg-cream/70 p-4">
      <p className="text-sm font-black text-clay">
        Type the job name to confirm permanent deletion
      </p>
      <p className="text-sm font-bold leading-6 text-charcoal/70">
        {lockReason} This cannot be undone.
      </p>
      <p className="text-sm font-bold text-charcoal/70">
        Job name: <span className="font-black text-deep-pine">{jobName}</span>
      </p>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={`Type ${jobName}`}
        autoComplete="off"
        spellCheck={false}
        className="form-input w-full"
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting || !nameMatches}
          className="rounded-full bg-clay px-5 py-3 font-black text-whitewarm hover:bg-clay/90 disabled:cursor-default disabled:opacity-50"
        >
          {isDeleting ? "Deleting..." : "Yes, delete permanently"}
        </button>
        <button
          type="button"
          onClick={() => {
            setUnlocked(false);
            setTyped("");
            setErrorMessage("");
          }}
          disabled={isDeleting}
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