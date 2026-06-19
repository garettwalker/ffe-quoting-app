"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { computeInvoiceAmounts } from "@/lib/invoice-calculations";
import { supabase } from "@/lib/supabase";
import type { InvoiceData, InvoiceKind, InvoiceRecord } from "@/lib/types";

type InvoiceBuilderProps = {
  quoteId: string;
  // The saved invoice setup, if any. Null means invoices have not been set up.
  initialInvoiceData: InvoiceData | null;
  // The accepted quote total, used to default the contract amount on first setup.
  quoteTotalCents: number;
};

export function InvoiceBuilder({
  quoteId,
  initialInvoiceData,
  quoteTotalCents
}: InvoiceBuilderProps) {
  const router = useRouter();
  const existing = initialInvoiceData;

  const [contractDollars, setContractDollars] = useState<number>(() =>
    existing ? centsToDollars(existing.contractAmountCents) : centsToDollars(quoteTotalCents)
  );
  const [roughInPercent, setRoughInPercent] = useState<number>(
    existing ? existing.roughInPercent : 50
  );
  const [finishPercent, setFinishPercent] = useState<number>(
    existing ? existing.finishPercent : 50
  );
  const [permitDollars, setPermitDollars] = useState<number>(() =>
    existing ? centsToDollars(existing.permitFeeCents) : 0
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Build a preview InvoiceData from the current inputs so amounts update live.
  const previewData: InvoiceData = {
    contractAmountCents: dollarsToCents(contractDollars),
    roughInPercent,
    finishPercent,
    permitFeeCents: dollarsToCents(permitDollars),
    generatedAt: existing?.generatedAt ?? new Date().toISOString(),
    invoices: existing?.invoices ?? []
  };

  const amounts = useMemo(
    () => computeInvoiceAmounts(previewData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contractDollars, roughInPercent, finishPercent, permitDollars, existing]
  );

  function buildInvoiceRecord(kind: InvoiceKind, now: string): InvoiceRecord {
    const prev = existing?.invoices.find((invoice) => invoice.kind === kind);
    const amountCents =
      kind === "initial"
        ? amounts.initialInvoiceAmountCents
        : amounts.finishInvoiceAmountCents;
    return {
      kind,
      amountCents,
      // Preserve paid status and timestamps across setup edits.
      status: prev?.status ?? "unpaid",
      issuedAt: prev?.issuedAt ?? now,
      paidAt: prev?.paidAt ?? null
    };
  }

  async function saveInvoices() {
    if (isSaving) return;

    setIsSaving(true);
    setSaveMessage("");

    const now = new Date().toISOString();
    const data: InvoiceData = {
      contractAmountCents: dollarsToCents(contractDollars),
      roughInPercent,
      finishPercent,
      permitFeeCents: dollarsToCents(permitDollars),
      generatedAt: now,
      invoices: [buildInvoiceRecord("initial", now), buildInvoiceRecord("finish", now)]
    };

    const { error } = await supabase
      .from("quotes")
      .update({ invoice_data: data, updated_at: now })
      .eq("id", quoteId);

    setIsSaving(false);

    if (error) {
      setSaveMessage(`Save failed: ${error.message}`);
      return;
    }

    setSaveMessage("Invoices saved. Adjust and save again any time.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Invoice Setup
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
          Contract amount, split, and permit fee
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          The initial invoice is the rough-in amount plus the permit fee. The
          finish invoice is the remainder. Defaults to a 50/50 split.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Contract Amount ($)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={contractDollars === 0 ? "" : contractDollars}
            onChange={(event) =>
              setContractDollars(
                event.target.value === "" ? 0 : Number(event.target.value)
              )
            }
            placeholder="Enter contract amount"
            className="form-input"
          />
        </Field>

        <Field label="Permit Fee ($)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={permitDollars === 0 ? "" : permitDollars}
            onChange={(event) =>
              setPermitDollars(
                event.target.value === "" ? 0 : Number(event.target.value)
              )
            }
            placeholder="0"
            className="form-input"
          />
        </Field>

        <Field label="Rough-In Percent (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={roughInPercent === 0 ? "" : roughInPercent}
            onChange={(event) =>
              setRoughInPercent(
                event.target.value === "" ? 0 : Number(event.target.value)
              )
            }
            placeholder="50"
            className="form-input"
          />
        </Field>

        <Field label="Finish Percent (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={finishPercent === 0 ? "" : finishPercent}
            onChange={(event) =>
              setFinishPercent(
                event.target.value === "" ? 0 : Number(event.target.value)
              )
            }
            placeholder="50"
            className="form-input"
          />
        </Field>
      </div>

      <div className="mt-5 rounded-xl1 border border-pine/10 bg-cream p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-clay">
          Live Preview
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PreviewLine
            label="Rough-in amount"
            value={formatCurrency(amounts.roughInAmountCents)}
            sub={`${roughInPercent}% of contract`}
          />
          <PreviewLine
            label="Permit fee"
            value={formatCurrency(dollarsToCents(permitDollars))}
          />
          <PreviewLine
            label="Initial invoice total"
            value={formatCurrency(amounts.initialInvoiceAmountCents)}
            sub="rough-in + permit"
            emphasize
          />
          <PreviewLine
            label="Finish invoice total"
            value={formatCurrency(amounts.finishInvoiceAmountCents)}
            sub={`${finishPercent}% of contract`}
            emphasize
          />
        </div>

        <div className="mt-3 text-sm font-bold">
          {amounts.isBalanced ? (
            <p className="text-deep-pine">
              Split totals 100% ({amounts.percentTotal}%). Invoices sum to{" "}
              {formatCurrency(amounts.totalInvoicedCents)}.
            </p>
          ) : (
            <p className="text-clay">
              Warning: rough-in ({roughInPercent}%) + finish ({finishPercent}%) ={" "}
              {amounts.percentTotal}%, which does not total 100%. Adjust the split
              so the invoices cover the full contract.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-charcoal/65">
          {existing
            ? "Saving updates the invoice amounts and keeps any paid statuses."
            : "This creates the two invoices for this accepted quote."}
        </p>
        <button
          type="button"
          onClick={saveInvoices}
          disabled={isSaving}
          className="rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
        >
          {isSaving ? "Saving..." : existing ? "Save Changes" : "Save Invoices"}
        </button>
      </div>

      {saveMessage ? (
        <div className="mt-4 rounded-soft border border-pine/15 bg-sage/20 p-4 font-bold text-deep-pine">
          {saveMessage}
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-sm font-black text-deep-pine">{label}</span>
      {children}
    </label>
  );
}

function PreviewLine({
  label,
  value,
  sub,
  emphasize
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-soft border border-pine/10 bg-whitewarm p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
        {label}
      </p>
      <p
        className={`font-display font-bold text-deep-pine ${
          emphasize ? "text-xl" : "text-lg"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="text-xs font-bold text-charcoal/55">{sub}</p> : null}
    </div>
  );
}