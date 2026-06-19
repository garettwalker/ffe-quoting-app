"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { InvoiceData, InvoiceKind } from "@/lib/types";

// Toggles one invoice's paid status. Writes the full invoice_data back so the
// server component re-reads it on router.refresh() and the badge updates.
export function InvoicePaidButton({
  quoteId,
  invoiceData,
  kind
}: {
  quoteId: string;
  invoiceData: InvoiceData;
  kind: InvoiceKind;
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
    const invoices = invoiceData.invoices.map((invoice) =>
      invoice.kind === kind
        ? {
            ...invoice,
            status: (invoice.status === "paid" ? "unpaid" : "paid") as
              | "unpaid"
              | "paid",
            paidAt: invoice.status === "paid" ? null : now
          }
        : invoice
    );
    const nextData: InvoiceData = { ...invoiceData, invoices };

    const { error } = await supabase
      .from("quotes")
      .update({ invoice_data: nextData, updated_at: now })
      .eq("id", quoteId);

    setIsWorking(false);

    if (error) {
      setErrorMessage(`${label} failed: ${error.message}`);
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