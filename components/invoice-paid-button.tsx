"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes after the Phase C pass.
const supabase = getSupabaseBrowser();
import type { InvoiceData, InvoiceKind } from "@/lib/types";

// Toggles one invoice's paid status. Writes the full invoice_data back so the
// server component re-reads it on router.refresh() and the badge updates. Also
// records (or reverses) a `payments` ledger row so we have an audit trail of
// actual money received — the invoice_data flag stays the UI source of truth;
// the payments row is the ledger. (Stripe card/ACH rows are written later by the
// webhook via the service-role client, which bypasses RLS.)
export function InvoicePaidButton({
  quoteId,
  invoiceData,
  kind,
  recordedBy,
  markUnpaidBlocked,
  markUnpaidBlockedReason
}: {
  quoteId: string;
  invoiceData: InvoiceData;
  kind: InvoiceKind;
  recordedBy: string;
  // True when a real online payment (card or ACH) has succeeded for this
  // invoice. The invoice flag is then the webhook's to manage: reversing real
  // money is a Stripe refund (charge.refunded flips the flag back), not a
  // manual toggle here. Blocking only the Mark Unpaid direction keeps Mark
  // Paid always available (that direction can never desync the ledger).
  markUnpaidBlocked?: boolean;
  markUnpaidBlockedReason?: string;
}) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const current = invoiceData.invoices.find((invoice) => invoice.kind === kind);
  const isPaid = current?.status === "paid";
  const label = isPaid ? "Mark Unpaid" : "Mark Paid";

  // A paid invoice that was paid online can't be flipped unpaid from here,
  // because that would desync the flag from the succeeded payment row (AR
  // would show money owed that was actually collected). Show the notice
  // instead of the button; the owner refunds in Stripe and the webhook
  // un-marks it.
  const showUnpaidBlock = isPaid && markUnpaidBlocked;

  async function handleClick() {
    if (isWorking) return;

    setIsWorking(true);
    setErrorMessage("");

    const now = new Date().toISOString();
    const markingPaid = current?.status !== "paid";
    const invoices = invoiceData.invoices.map((invoice) =>
      invoice.kind === kind
        ? {
            ...invoice,
            status: (markingPaid ? "paid" : "unpaid") as "unpaid" | "paid",
            paidAt: markingPaid ? now : null
          }
        : invoice
    );
    const nextData: InvoiceData = { ...invoiceData, invoices };

    // Flip the invoice flag first — it's the UI source of truth, so the badge
    // updates correctly on refresh even if the ledger write hiccups.
    const { error } = await supabase
      .from("quotes")
      .update({ invoice_data: nextData, updated_at: now })
      .eq("id", quoteId);

    if (error) {
      setIsWorking(false);
      setErrorMessage(`${label} failed: ${error.message}`);
      return;
    }

    // Best-effort ledger write. Non-atomic across two queries (a known v1
    // limitation; a future Postgres RPC can do both in one transaction). If this
    // fails we surface a warning but the flag above already flipped, so refresh
    // shows the true paid state and the owner can retry the ledger side.
    let ledgerError = "";
    if (markingPaid && current) {
      const { error: insertError } = await supabase.from("payments").insert({
        quote_id: quoteId,
        invoice_kind: kind,
        amount_cents: Math.round(current.amountCents) || 0,
        method: "manual",
        status: "succeeded",
        recorded_by: recordedBy || null,
        paid_at: now
      });
      if (insertError) ledgerError = insertError.message;
    } else {
      // Reversing a manual mark: remove the manual payment row(s) for this
      // invoice so the ledger matches the flag. Stripe card/ACH rows are never
      // deleted here (method != 'manual').
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("quote_id", quoteId)
        .eq("invoice_kind", kind)
        .eq("method", "manual")
        .eq("status", "succeeded");
      if (deleteError) ledgerError = deleteError.message;
      else {
        // Admin override: also mark any stuck non-terminal Stripe rows for this
        // invoice (an incomplete/processing ACH the owner cancelled in the
        // Stripe dashboard, which our webhook may not have heard about) as
        // failed, so the ledger matches the now-unpaid flag and a fresh payment
        // can be taken. A succeeded/refunded Stripe row is NEVER touched here:
        // that is real money, and reversing it is a refund handled in Stripe
        // (charge.refunded via the webhook), not a manual toggle.
        const { error: staleError } = await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("quote_id", quoteId)
          .eq("invoice_kind", kind)
          .neq("method", "manual")
          .in("status", ["processing", "pending"]);
        if (staleError) ledgerError = staleError.message;
      }
    }

    setIsWorking(false);

    if (ledgerError) {
      setErrorMessage(
        `Marked ${markingPaid ? "paid" : "unpaid"}, but the payment ledger didn't update: ${ledgerError}`
      );
      router.refresh();
      return;
    }

    router.refresh();
  }

  if (showUnpaidBlock) {
    return (
      <div className="rounded-xl1 border border-clay/20 bg-cream/60 p-4">
        <p className="text-sm font-black text-clay">Paid online</p>
        <p className="mt-1 text-sm font-bold leading-6 text-charcoal/70">
          {markUnpaidBlockedReason}
        </p>
      </div>
    );
  }

  const variantClass = isPaid
    ? "border border-pine/20 text-deep-pine hover:bg-pine hover:text-whitewarm"
    : "bg-pine text-whitewarm hover:bg-deep-pine";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isWorking}
        className={`rounded-full px-5 py-3 text-center font-black shadow-card transition disabled:cursor-default disabled:opacity-60 ${variantClass}`}
      >
        {isWorking ? `${label}...` : label}
      </button>

      {errorMessage ? (
        <p className="text-sm font-bold leading-5 text-clay">{errorMessage}</p>
      ) : null}
    </>
  );
}