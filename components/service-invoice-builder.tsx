"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { InvoiceData, InvoiceRecord, ServiceLine } from "@/lib/types";
import { FormattedNumberInput } from "@/components/formatted-number-input";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes.
const supabase = getSupabaseBrowser();

// Generate a stable unique id for a new freeform line. crypto.randomUUID is
// available in the browser; fall back to a timestamp+counter if unavailable.
let lineCounter = 0;
function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  lineCounter += 1;
  return `line-${Date.now()}-${lineCounter}`;
}

type ServiceInvoiceBuilderProps = {
  quoteId: string;
  // The saved invoice setup, if any. Null means invoices have not been set up.
  initialInvoiceData: InvoiceData | null;
  // The quote's freeform lines, used to seed the invoice the first time
  // invoicing is set up. Once saved, the lines live on the invoice
  // (invoice_data.serviceLines) and are edited independently of the quote
  // (mirrors the new-build scopeLines pattern).
  seedServiceLines: ServiceLine[];
};

// Service-call invoice setup. A service call has a SINGLE invoice (no
// rough-in/finish split, no permit). The invoice amount is the sum of the
// freeform line amounts (description + qty + row amount; no unit price). The
// lines are seeded from the quote the first time invoicing is set up, then
// live on the invoice and are edited independently of the quote. Mirrors the
// new-build InvoiceBuilder (components/invoice-builder.tsx) but without the
// split / permit / catalog machinery.
export function ServiceInvoiceBuilder({
  quoteId,
  initialInvoiceData,
  seedServiceLines
}: ServiceInvoiceBuilderProps) {
  const router = useRouter();
  const existing = initialInvoiceData;

  // Freeform line items for the invoice. Seeded from the existing invoice's
  // serviceLines if it has them (independent of the quote), otherwise from the
  // quote's lines (first setup). An invoice whose lines were all removed starts
  // empty (a $0 / no-charge service call is allowed).
  const [lines, setLines] = useState<ServiceLine[]>(() => {
    if (Array.isArray(existing?.serviceLines)) {
      return (existing!.serviceLines as ServiceLine[]).map((line) => ({
        id: line.id,
        name: line.name,
        quantity: line.quantity,
        amountCents: line.amountCents,
        comment: line.comment
      }));
    }
    return seedServiceLines.map((line) => ({ ...line }));
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState(false);

  // The invoice amount is the sum of the row amounts.
  const amountCents = useMemo(
    () => lines.reduce((sum, line) => sum + line.amountCents, 0),
    [lines]
  );

  // Clear any stale save message as soon as the owner edits an input.
  useEffect(() => {
    setSaveMessage("");
    setSaveError(false);
  }, [lines]);

  const serviceInvoice =
    existing?.invoices.find((invoice) => invoice.kind === "service") ?? null;

  // A paid invoice records money that was actually collected. If the owner's
  // current lines would give it a different amount, saving must NOT silently
  // rewrite the collected amount while leaving the "paid" badge in place.
  // Instead we flag it so we can (1) warn before the save and (2) reset it to
  // unpaid on save so the owner re-marks it paid at the new amount.
  const paidAmountChange = useMemo(() => {
    if (!serviceInvoice || serviceInvoice.status !== "paid") return null;
    if (serviceInvoice.amountCents === amountCents) return null;
    return {
      fromCents: serviceInvoice.amountCents,
      toCents: amountCents
    };
  }, [serviceInvoice, amountCents]);

  function buildInvoiceRecord(now: string, assignNumber?: string): InvoiceRecord {
    const prev = serviceInvoice;
    const invoiceNumber = prev?.invoiceNumber ?? assignNumber;

    // Reset a previously-paid invoice when its amount changes (see note on
    // paidAmountChange). The owner must re-mark it paid against the new amount.
    if (prev?.status === "paid" && prev.amountCents !== amountCents) {
      return {
        kind: "service",
        amountCents,
        status: "unpaid",
        issuedAt: prev.issuedAt ?? now,
        paidAt: null,
        invoiceNumber
      };
    }

    return {
      kind: "service",
      amountCents,
      // Preserve paid status and timestamps across setup edits.
      status: prev?.status ?? "unpaid",
      issuedAt: prev?.issuedAt ?? now,
      paidAt: prev?.paidAt ?? null,
      invoiceNumber
    };
  }

  // --- Line editing -------------------------------------------------------

  function handleAddLine() {
    setSaveMessage("");
    setSaveError(false);
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        name: "",
        quantity: 1,
        amountCents: 0,
        comment: ""
      }
    ]);
  }

  function handleUpdateLine(id: string, patch: Partial<ServiceLine>) {
    setSaveMessage("");
    setSaveError(false);
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line))
    );
  }

  function handleRemoveLine(id: string) {
    setSaveMessage("");
    setSaveError(false);
    setLines((prev) => prev.filter((line) => line.id !== id));
  }

  async function saveInvoice() {
    if (isSaving) return;

    setIsSaving(true);
    setSaveError(false);
    setSaveMessage("");

    const now = new Date().toISOString();

    // Reserve a sequential invoice number (INV-NNNN) if the service invoice
    // does not already have one. A brand-new setup mints one; an already-
    // numbered setup re-saved keeps its number (no gap burned).
    let assignNumber: string | undefined;
    if (!serviceInvoice?.invoiceNumber) {
      try {
        assignNumber = await nextInvoiceNumber();
      } catch (err) {
        setIsSaving(false);
        setSaveError(true);
        setSaveMessage(
          err instanceof Error ? err.message : "Could not assign an invoice number."
        );
        return;
      }
    }

    const data: InvoiceData = {
      quoteType: "service_call",
      contractAmountCents: amountCents,
      // Unused for service calls (single invoice, no split/permit) but kept on
      // the shape for a consistent InvoiceData record.
      roughInPercent: 0,
      finishPercent: 0,
      permitFeeCents: 0,
      generatedAt: now,
      invoices: [buildInvoiceRecord(now, assignNumber)],
      // Persist the invoice's own lines so it is independent of the quote from
      // this save onward. An invoice whose lines were cleared saves an empty
      // array (the owner's clear is respected, no quote backfill).
      serviceLines: lines.map((line) => ({
        id: line.id,
        name: line.name.trim(),
        quantity: line.quantity,
        amountCents: line.amountCents,
        comment: line.comment?.trim() || undefined
      }))
    };

    const { error } = await supabase
      .from("quotes")
      .update({ invoice_data: data, updated_at: now })
      .eq("id", quoteId);

    setIsSaving(false);

    if (error) {
      setSaveError(true);
      setSaveMessage(`Save failed: ${error.message}`);
      return;
    }

    setSaveError(false);
    if (paidAmountChange) {
      setSaveMessage(
        `Invoice saved. The paid invoice amount changed (was ${formatCurrency(
          paidAmountChange.fromCents
        )}, now ${formatCurrency(
          paidAmountChange.toCents
        )}), so it was reset to unpaid. Re-mark it paid at the new amount.`
      );
    } else {
      setSaveMessage("Invoice saved. Adjust and save again any time.");
    }
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Invoice Setup
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
          Freeform line items
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          The invoice amount is the sum of the line amounts below. Add a
          description, a quantity, and the row amount. No unit price, no split,
          no permit fee.
        </p>
      </div>

      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
          Line Items
        </p>
        <button
          type="button"
          onClick={handleAddLine}
          className="rounded-full border border-pine/20 bg-whitewarm px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          + Add line
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="mt-3 rounded-soft border border-pine/15 bg-cream px-4 py-8 text-center text-sm font-bold text-charcoal/60">
          No line items yet. Click &quot;Add line&quot; to add the first one, or
          save with no lines for a $0 / no-charge invoice.
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {lines.map((line, index) => (
            <ServiceInvoiceLineRow
              key={line.id}
              index={index}
              line={line}
              onUpdate={(patch) => handleUpdateLine(line.id, patch)}
              onRemove={() => handleRemoveLine(line.id)}
              canRemove={lines.length > 1}
            />
          ))}
        </div>
      )}

      <div className="mt-5 rounded-xl1 border border-pine/10 bg-cream p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-clay">
          Invoice amount (before saving)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PreviewLine
            label="Service Invoice"
            value={formatCurrency(amountCents)}
            sub="sum of line amounts"
            emphasize
          />
          <PreviewLine
            label="Lines"
            value={String(lines.length)}
            sub={lines.length === 1 ? "1 line" : `${lines.length} lines`}
          />
        </div>
      </div>

      {paidAmountChange ? (
        <div className="mt-5 rounded-soft border border-clay/30 bg-clay/10 p-4 text-sm font-bold leading-6 text-clay">
          <p>
            Heads up: your changes would change the amount of the paid invoice
            from {formatCurrency(paidAmountChange.fromCents)} to{" "}
            {formatCurrency(paidAmountChange.toCents)}. Saving resets it to unpaid
            so you can re-mark it paid at the new amount (a paid invoice records
            money already collected, so its amount is never changed silently).
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-charcoal/65">
          {existing
            ? "Saving updates the line items and invoice amount, and keeps any paid status."
            : "This creates the service invoice for this accepted quote."}
        </p>
        <button
          type="button"
          onClick={saveInvoice}
          disabled={isSaving}
          className="rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
        >
          {isSaving ? "Saving..." : existing ? "Save Changes" : "Save Invoice"}
        </button>
      </div>

      {saveMessage ? (
        <div
          className={`mt-4 rounded-soft border p-4 font-bold ${
            saveError
              ? "border-clay/30 bg-clay/10 text-clay"
              : "border-pine/15 bg-sage/20 text-deep-pine"
          }`}
        >
          {saveMessage}
        </div>
      ) : null}
    </section>
  );
}

function ServiceInvoiceLineRow({
  index,
  line,
  onUpdate,
  onRemove,
  canRemove
}: {
  index: number;
  line: ServiceLine;
  onUpdate: (patch: Partial<ServiceLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-xl1 border border-pine/10 bg-cream p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-clay">
          Line {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="text-xs font-black text-clay hover:underline disabled:cursor-default disabled:opacity-40 disabled:no-underline"
        >
          Remove
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_120px_160px]">
        <label className="grid min-w-0 gap-1">
          <span className="text-xs font-black text-deep-pine">Description</span>
          <input
            type="text"
            value={line.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g. Troubleshoot dead outlets"
            className="form-input"
          />
        </label>

        <label className="grid min-w-0 gap-1">
          <span className="text-xs font-black text-deep-pine">Qty</span>
          <FormattedNumberInput
            value={line.quantity}
            onChange={(value) => onUpdate({ quantity: value })}
            min={0}
            placeholder="1"
            className="form-input"
          />
        </label>

        <label className="grid min-w-0 gap-1">
          <span className="text-xs font-black text-deep-pine">Amount ($)</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-charcoal/55">$</span>
            <FormattedNumberInput
              value={centsToDollars(line.amountCents)}
              onChange={(dollars) =>
                onUpdate({ amountCents: dollarsToCents(dollars) })
              }
              allowDecimal
              min={0}
              placeholder="0.00"
              className="form-input"
            />
          </div>
        </label>
      </div>

      <label className="mt-3 grid min-w-0 gap-1">
        <span className="text-xs font-black text-deep-pine">
          Comment (optional, shown to customer)
        </span>
        <input
          type="text"
          value={line.comment ?? ""}
          onChange={(e) => onUpdate({ comment: e.target.value })}
          placeholder="Optional note shown under this line on the invoice"
          className="form-input"
        />
      </label>
    </div>
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