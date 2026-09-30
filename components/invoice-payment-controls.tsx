"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes.
const supabase = getSupabaseBrowser();

import { FormattedNumberInput } from "@/components/formatted-number-input";
import { centsToDollars, dollarsToCents, formatCurrency, formatDate } from "@/lib/currency";
import {
  invoiceBalanceCents,
  invoiceIsOverpaid,
  invoicePaidCents,
  withInvoicePaidCents
} from "@/lib/invoice-calculations";
import type { InvoiceData, InvoiceKind } from "@/lib/types";

// One row from the payments ledger, as the invoicing page selects it.
export type InvoicePaymentRow = {
  id: string;
  amount_cents: number;
  method: string;
  status: string;
  note: string | null;
  paid_at: string | null;
  recorded_by: string | null;
};

// Money collected on one invoice: what came in, what is left, and the controls
// to change it.
//
// An invoice can be paid in several pieces (a stalled job where the customer
// hands over part of the bill, a deposit collected by check, a balance paid by
// card later). Each piece is a `payments` row (the audit trail) and the total is
// mirrored onto the invoice as `paidCents` (what every screen reads). Both are
// written together here: the ledger row first, then the invoice, so a failure
// between the two never loses the record of the money.
//
// Only money that has actually settled counts: a card or ACH row still
// "processing" is shown as in progress and is NOT added to the balance, which is
// what the Stripe webhook does too (it only counts succeeded rows).
export function InvoicePaymentControls({
  quoteId,
  invoiceData,
  kind,
  payments,
  recordedBy,
  clearBlocked,
  clearBlockedReason
}: {
  quoteId: string;
  invoiceData: InvoiceData;
  kind: InvoiceKind;
  payments: InvoicePaymentRow[];
  recordedBy: string;
  // True when a real online payment (card or ACH) has succeeded for this
  // invoice. Clearing then would desync the invoice from the ledger: real money
  // is reversed by a Stripe refund (the webhook clears the invoice itself), not
  // from here.
  clearBlocked?: boolean;
  clearBlockedReason?: string;
}) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [amountDollars, setAmountDollars] = useState(0);
  const [receivedOn, setReceivedOn] = useState(todayInputValue());
  const [note, setNote] = useState("");

  const invoice = invoiceData.invoices.find((row) => row.kind === kind) ?? null;
  if (!invoice) return null;

  const amountCents = Math.max(0, Math.round(invoice.amountCents) || 0);
  const paidCents = invoicePaidCents(invoice);
  const balanceCents = invoiceBalanceCents(invoice);
  const isOverpaid = invoiceIsOverpaid(invoice);
  const isSettled = invoice.status === "paid";
  // Held separately so the update handlers below don't have to re-narrow.
  const lastPaidAt = invoice.paidAt;

  // Settled ledger rows vs in-flight ones. In-flight (card processing, ACH
  // awaiting settlement) is shown but never counted: the money is not ours yet.
  const settledRows = payments.filter((row) => row.status === "succeeded");
  const inFlightRows = payments.filter(
    (row) => row.status === "processing" || row.status === "pending"
  );
  const refundedRows = payments.filter((row) => row.status === "refunded");
  const historyRows = [...settledRows, ...inFlightRows, ...refundedRows].sort((a, b) =>
    (b.paid_at ?? "").localeCompare(a.paid_at ?? "")
  );

  const hasInFlightOnline = inFlightRows.some((row) => row.method !== "manual");
  const hasSettledOnline = settledRows.some((row) => row.method !== "manual");

  // What an amount typed into the form would leave owing. Drives the live
  // "New balance" preview so the owner sees the result before saving.
  // The amount field holds DOLLARS (FormattedNumberInput parses what was typed),
  // so it must be converted once, with dollarsToCents. Using centsToDollars here
  // read $15,000 as 150 cents.
  const typedCents = Math.max(0, dollarsToCents(amountDollars) || 0);
  const previewBalanceCents = Math.max(0, balanceCents - typedCents);
  const previewIsFull = typedCents > 0 && typedCents >= balanceCents;

  function openForm(defaultDollars: number, defaultNote = "") {
    setAmountDollars(defaultDollars);
    setReceivedOn(todayInputValue());
    setNote(defaultNote);
    setErrorMessage("");
    setIsFormOpen(true);
  }

  // Record one payment: insert the ledger row, then mirror the new total onto
  // the invoice. `amountCents` is added to what is already collected, and
  // withInvoicePaidCents recomputes the paid/unpaid flag from the new total, so
  // a payment that finishes the invoice flips it to Paid in the same write.
  async function recordPayment(input: {
    amountCents: number;
    paidAtIso: string;
    note: string;
  }) {
    if (isWorking) return;
    if (input.amountCents <= 0) {
      setErrorMessage("Enter an amount greater than $0.");
      return;
    }
    if (hasInFlightOnline) {
      setErrorMessage(
        "An online payment on this invoice is still processing. Wait for it to finish (or for it to fail) before recording a payment by hand, so the same money is not counted twice."
      );
      return;
    }

    setIsWorking(true);
    setErrorMessage("");

    const { error: insertError } = await supabase.from("payments").insert({
      quote_id: quoteId,
      invoice_kind: kind,
      amount_cents: input.amountCents,
      method: "manual",
      status: "succeeded",
      ...(input.note ? { note: input.note } : {}),
      recorded_by: recordedBy || null,
      paid_at: input.paidAtIso
    });

    if (insertError) {
      setIsWorking(false);
      setErrorMessage(`Could not record the payment: ${insertError.message}`);
      return;
    }

    const { error: writeError } = await writeCollected(paidCents + input.amountCents, input.paidAtIso);

    setIsWorking(false);
    if (writeError) {
      setErrorMessage(
        `The payment was recorded, but the invoice did not update: ${writeError}. Reload this page and check the balance before recording anything else.`
      );
      router.refresh();
      return;
    }

    setIsFormOpen(false);
    setNote("");
    router.refresh();
  }

  // Write the collected total onto the invoice. Single place that keeps status
  // and paidAt in step with the money.
  async function writeCollected(
    collectedCents: number,
    paidAtIso: string | null
  ): Promise<{ error: string }> {
    const nextData = withInvoicePaidCents(invoiceData, kind, collectedCents, paidAtIso);
    const { error } = await supabase
      .from("quotes")
      .update({ invoice_data: nextData, updated_at: new Date().toISOString() })
      .eq("id", quoteId);
    return { error: error ? error.message : "" };
  }

  // Undo one hand-recorded payment. Online payments are never deleted here:
  // that is real money, reversed by a refund in Stripe.
  async function deletePayment(row: InvoicePaymentRow) {
    if (isWorking) return;
    setIsWorking(true);
    setErrorMessage("");

    const { error: deleteError } = await supabase
      .from("payments")
      .delete()
      .eq("id", row.id);

    if (deleteError) {
      setIsWorking(false);
      setErrorMessage(`Could not remove that payment: ${deleteError.message}`);
      return;
    }

    const { error: writeError } = await writeCollected(
      Math.max(0, paidCents - (Math.round(row.amount_cents) || 0)),
      lastPaidAt
    );

    setIsWorking(false);
    if (writeError) {
      setErrorMessage(
        `The payment was removed from the ledger, but the invoice did not update: ${writeError}. Reload this page and check the balance.`
      );
    }
    router.refresh();
  }

  // Wipe the invoice back to unpaid: remove its hand-recorded payments and
  // zero the collected total. Online money is not touched (this is blocked when
  // any exists), and a stuck card/ACH attempt is marked failed so a fresh
  // payment can be taken.
  async function clearPayments() {
    if (isWorking) return;
    const confirmed = window.confirm(
      `Clear all recorded payments on this invoice?\n\nThis removes the payment history for it and marks the invoice unpaid. This cannot be undone.`
    );
    if (!confirmed) return;

    setIsWorking(true);
    setErrorMessage("");

    const { error: deleteError } = await supabase
      .from("payments")
      .delete()
      .eq("quote_id", quoteId)
      .eq("invoice_kind", kind)
      .eq("method", "manual");

    if (deleteError) {
      setIsWorking(false);
      setErrorMessage(`Could not clear the payments: ${deleteError.message}`);
      return;
    }

    const { error: staleError } = await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("quote_id", quoteId)
      .eq("invoice_kind", kind)
      .neq("method", "manual")
      .in("status", ["processing", "pending"]);

    const { error: writeError } = await writeCollected(0, null);

    setIsWorking(false);
    const problem = staleError?.message || writeError;
    if (problem) {
      setErrorMessage(
        `Cleared what it could, but something did not finish: ${problem}. Reload this page and check.`
      );
    }
    setIsFormOpen(false);
    router.refresh();
  }

  const progressPercent =
    amountCents > 0 ? Math.min(100, Math.round((paidCents / amountCents) * 100)) : 0;

  return (
    <div className="mt-4 border-t border-pine/10 pt-4">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-clay">
        Payments received
      </p>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-black text-deep-pine">
          {formatCurrency(paidCents)} of {formatCurrency(amountCents)}
        </p>
        <p className="text-sm font-bold text-charcoal/70">
          {isSettled
            ? "Paid in full"
            : isOverpaid
              ? `Overpaid by ${formatCurrency(paidCents - amountCents)}`
              : `${formatCurrency(balanceCents)} due`}
        </p>
      </div>

      {amountCents > 0 ? (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sand">
          <div
            className={`h-full rounded-full ${isSettled ? "bg-moss" : "bg-clay"}`}
            style={{ width: `${isOverpaid ? 100 : progressPercent}%` }}
          />
        </div>
      ) : null}

      {isOverpaid ? (
        <p className="mt-2 rounded-soft bg-clay/15 px-3 py-2 text-sm font-bold leading-6 text-clay">
          More has been collected on this invoice than it is now for. Adjust the
          invoice amount above, or handle the difference as a credit or refund
          outside the app.
        </p>
      ) : null}

      {inFlightRows.length > 0 ? (
        <p className="mt-2 rounded-soft bg-sand px-3 py-2 text-sm font-bold leading-6 text-charcoal/80">
          {inFlightRows.length === 1 ? "An online payment is" : "Online payments are"}{" "}
          still processing and {inFlightRows.length === 1 ? "is" : "are"} not counted
          above yet. Bank transfers can take a few business days to settle.
        </p>
      ) : null}

      {historyRows.length > 0 ? (
        <ul className="mt-3 divide-y divide-pine/10 border-t border-pine/10">
          {historyRows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-black text-deep-pine">
                {formatCurrency(Math.round(row.amount_cents) || 0)}
              </span>
              <span className="text-sm font-bold text-charcoal/70">
                {methodLabel(row.method)}
                {row.status === "processing" || row.status === "pending"
                  ? " (processing)"
                  : ""}
                {row.status === "refunded" ? " (refunded)" : ""}
              </span>
              <span className="text-sm font-bold text-charcoal/60">
                {formatDate(row.paid_at)}
              </span>
              {row.note ? (
                <span className="text-sm font-bold text-charcoal/70">{row.note}</span>
              ) : null}
              {row.recorded_by ? (
                <span className="text-xs font-bold text-charcoal/50">
                  {row.recorded_by}
                </span>
              ) : null}
              {row.method === "manual" ? (
                <button
                  type="button"
                  onClick={() => deletePayment(row)}
                  disabled={isWorking}
                  className="ml-auto text-sm font-black text-clay underline decoration-clay/40 decoration-2 underline-offset-4 hover:text-deep-pine disabled:cursor-default disabled:opacity-60"
                >
                  Remove
                </button>
              ) : (
                <span className="ml-auto text-xs font-bold text-charcoal/50">
                  Reverse in Stripe
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm font-bold text-charcoal/60">
          No payments recorded on this invoice yet.
        </p>
      )}

      {!isSettled && balanceCents > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {isFormOpen ? null : (
            <>
              <button
                type="button"
                onClick={() => openForm(centsToDollars(balanceCents))}
                disabled={isWorking}
                className="rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card transition hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
              >
                Record payment
              </button>
              <button
                type="button"
                onClick={() =>
                  recordPayment({
                    amountCents: balanceCents,
                    paidAtIso: new Date().toISOString(),
                    note: ""
                  })
                }
                disabled={isWorking}
                className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine transition hover:bg-pine hover:text-whitewarm disabled:cursor-default disabled:opacity-60"
              >
                {isWorking ? "Saving..." : "Mark paid in full"}
              </button>
            </>
          )}
        </div>
      ) : null}

      {isFormOpen ? (
        <div className="mt-3 rounded-xl1 border border-pine/15 bg-cream p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-clay">
                Amount
              </span>
              <FormattedNumberInput
                value={amountDollars}
                onChange={setAmountDollars}
                allowDecimal
                min={0}
                placeholder="0.00"
                className="w-full rounded-soft border border-pine/20 bg-whitewarm px-3 py-2 font-bold text-deep-pine"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-clay">
                Date received
              </span>
              <input
                type="date"
                value={receivedOn}
                onChange={(event) => setReceivedOn(event.target.value)}
                className="w-full rounded-soft border border-pine/20 bg-whitewarm px-3 py-2 font-bold text-deep-pine"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-clay">
                Note (optional)
              </span>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Check #1043, stalled project"
                className="w-full rounded-soft border border-pine/20 bg-whitewarm px-3 py-2 font-bold text-deep-pine"
              />
            </label>
          </div>

          <p className="mt-3 text-sm font-bold text-charcoal/75">
            {typedCents <= 0
              ? `Recording nothing yet. ${formatCurrency(balanceCents)} due.`
              : previewIsFull
                ? `New balance: $0.00. This invoice will read Paid in full.`
                : `New balance: ${formatCurrency(previewBalanceCents)}.`}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                recordPayment({
                  amountCents: typedCents,
                  paidAtIso: dateInputToIso(receivedOn),
                  note: note.trim()
                })
              }
              disabled={isWorking}
              className="rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card transition hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
            >
              {isWorking ? "Saving..." : "Save payment"}
            </button>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              disabled={isWorking}
              className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine transition hover:bg-pine hover:text-whitewarm disabled:cursor-default disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {clearBlocked && hasSettledOnline ? (
        <div className="mt-3 rounded-xl1 border border-clay/20 bg-cream/60 p-4">
          <p className="text-sm font-black text-clay">Paid online</p>
          <p className="mt-1 text-sm font-bold leading-6 text-charcoal/70">
            {clearBlockedReason}
          </p>
        </div>
      ) : paidCents > 0 || historyRows.length > 0 ? (
        <button
          type="button"
          onClick={clearPayments}
          disabled={isWorking}
          className="mt-3 text-sm font-black text-clay underline decoration-clay/40 decoration-2 underline-offset-4 hover:text-deep-pine disabled:cursor-default disabled:opacity-60"
        >
          Clear payments
        </button>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 text-sm font-bold leading-5 text-clay">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function methodLabel(method: string): string {
  if (method === "manual") return "Recorded by hand";
  if (method === "ach_debit") return "Bank transfer";
  if (method === "card") return "Card";
  return method;
}

// Today as YYYY-MM-DD in the viewer's own timezone (toISOString() would use
// UTC and can show yesterday evening in the US).
function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// A date-input value ("2026-09-29") as an ISO timestamp at midday local time,
// so storing it never shifts the day backwards in another timezone.
function dateInputToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date().toISOString();
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
    0
  );
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}
