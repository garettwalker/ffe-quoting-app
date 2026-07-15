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
  recordedBy
}: {
  quoteId: string;
  invoiceData: InvoiceData;
  kind: InvoiceKind;
  recordedBy: string;
}) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const current = invoiceData.invoices.find((invoice) => invoice.kind === kind);
  const isPaid = current?.status === "paid";
  const label = isPaid ? "Mark Unpaid" : "Mark Paid";

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
      // touched here (method != 'manual').
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("quote_id", quoteId)
        .eq("invoice_kind", kind)
        .eq("method", "manual")
        .eq("status", "succeeded");
      if (deleteError) ledgerError = deleteError.message;
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