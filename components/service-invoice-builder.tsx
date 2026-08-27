"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { computeInvoiceAmounts, isUnsplitServiceCall } from "@/lib/invoice-calculations";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { InvoiceData, InvoiceKind, InvoiceRecord, ServiceLine } from "@/lib/types";
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

// Service-call invoice setup. A service call has TWO billing shapes:
//
//   - UNSPLIT (the default): a single kind "service" invoice, due on
//     completion. The invoice amount is the sum of the freeform line amounts.
//     This is the original service-call model — kept for quick jobs
//     (troubleshoot, a small repair) and for every service quote saved before
//     the split option existed.
//   - SPLIT: a deposit (kind "initial") + a final (kind "finish") invoice,
//     reusing the new-build two-invoice machinery (a % split of the contract,
//     no permit, paid-deposit freeze). Lets Chad bill 50% up front / 50% at
//     finish on a remodel sized like a service call.
//
// The freeform line editor is the same in both shapes — the lines are the
// scope shown on every invoice. The "Billing schedule" section below the lines
// toggles the shape and, when split, sets the deposit %. Mirrors the new-build
// InvoiceBuilder (components/invoice-builder.tsx) for the split / freeze /
// number-reservation / paid-reset logic, but without the catalog scope lines
// / permit / rough-in machinery.
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

  // Billing schedule shape. Inferred from the saved records: a kind "service"
  // invoice = unsplit; kind "initial"/"finish" = split. A brand-new setup
  // (existing === null) defaults to unsplit (one invoice, due on completion).
  const [split, setSplit] = useState<boolean>(() => {
    if (!existing) return false;
    if (isUnsplitServiceCall(existing)) return false;
    return existing.invoices.some(
      (i) => i.kind === "initial" || i.kind === "finish"
    );
  });

  // Deposit percent of the contract (split mode). The final is the remainder
  // (100 - deposit). Defaults to 50. Loaded from the saved roughInPercent when
  // the setup is already split.
  const [depositPercent, setDepositPercent] = useState<number>(() => {
    if (existing && !isUnsplitServiceCall(existing)) {
      return existing.roughInPercent || 50;
    }
    return 50;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState(false);

  // The contract = the sum of the freeform line amounts (both shapes).
  const amountCents = useMemo(
    () => lines.reduce((sum, line) => sum + line.amountCents, 0),
    [lines]
  );

  const finishPercent = 100 - depositPercent;

  // Existing invoice records by kind (preserve paid status / numbers /
  // timestamps / the paid-deposit's collected amount across setup edits).
  const existingService =
    existing?.invoices.find((invoice) => invoice.kind === "service") ?? null;
  const existingInitial =
    existing?.invoices.find((invoice) => invoice.kind === "initial") ?? null;
  const existingFinish =
    existing?.invoices.find((invoice) => invoice.kind === "finish") ?? null;

  // A paid invoice records money that was actually collected. Changing the
  // billing-schedule SHAPE (split on/off) would orphan a paid record of the
  // other shape, so the toggle is locked while any invoice is paid. Editing
  // the line items within the same shape is still allowed — the change flows
  // to an unpaid invoice, or resets a paid invoice whose amount changed (with
  // a warning before the save).
  const anyPaid = existing?.invoices.some((i) => i.status === "paid") ?? false;
  const splitLocked = anyPaid;

  // Once the deposit (initial) is paid, it is frozen — the money was
  // collected. Any later change to the line items flows ONLY to the final
  // invoice (computeInvoiceAmounts freeze path: final = contract - paid
  // deposit). The deposit-% field is locked in this state and the live
  // preview shows the lock.
  const depositPaid = split && existingInitial?.status === "paid";

  // Build a preview InvoiceData matching the current shape so
  // computeInvoiceAmounts gives live deposit/final amounts. The existing
  // records are carried through so the freeze path can read the paid
  // deposit's collected amount; when the shape has no saved record yet, a
  // fresh unpaid record stands in (its amountCents is unused — the split path
  // recomputes from the % and the unsplit path early-returns the contract).
  const previewData: InvoiceData = useMemo(() => {
    const base = {
      quoteType: "service_call" as const,
      contractAmountCents: amountCents,
      permitFeeCents: 0,
      generatedAt: existing?.generatedAt ?? new Date().toISOString(),
      serviceLines: lines
    };
    if (split) {
      const freshInitial: InvoiceRecord = {
        kind: "initial",
        amountCents: 0,
        status: "unpaid",
        issuedAt: null,
        paidAt: null
      };
      const freshFinish: InvoiceRecord = {
        kind: "finish",
        amountCents: 0,
        status: "unpaid",
        issuedAt: null,
        paidAt: null
      };
      return {
        ...base,
        roughInPercent: depositPercent,
        finishPercent,
        invoices: [existingInitial ?? freshInitial, existingFinish ?? freshFinish]
      };
    }
    const freshService: InvoiceRecord = {
      kind: "service",
      amountCents: 0,
      status: "unpaid",
      issuedAt: null,
      paidAt: null
    };
    return {
      ...base,
      roughInPercent: 0,
      finishPercent: 0,
      invoices: [existingService ?? freshService]
    };
  }, [
    split,
    amountCents,
    depositPercent,
    finishPercent,
    lines,
    existing,
    existingInitial,
    existingFinish,
    existingService
  ]);

  const amounts = useMemo(
    () => computeInvoiceAmounts(previewData),
    [previewData]
  );

  // A paid invoice records money that was actually collected. If the owner's
  // current lines would give that invoice a different amount, saving must NOT
  // silently rewrite the collected amount while leaving the "paid" badge in
  // place. Instead we flag it so we can (1) warn before the save and (2) reset
  // it to unpaid on save so the owner re-marks it paid at the new amount. The
  // paid deposit (initial) is frozen and never produces a change; only a paid
  // final (split) or a paid service invoice (unsplit) can reset.
  const paidAmountChanges = useMemo(() => {
    if (!existing) {
      return [] as { kind: InvoiceKind; label: string; fromCents: number; toCents: number }[];
    }
    const changes: {
      kind: InvoiceKind;
      label: string;
      fromCents: number;
      toCents: number;
    }[] = [];
    for (const prev of existing.invoices) {
      if (prev.status !== "paid") continue;
      // The paid deposit is frozen — never a paid-amount change.
      if (split && prev.kind === "initial") continue;
      const toCents = split
        ? prev.kind === "finish"
          ? amounts.finishInvoiceAmountCents
          : amounts.initialInvoiceAmountCents
        : amounts.initialInvoiceAmountCents; // unsplit: early-return puts the full contract in initialInvoiceAmountCents
      if (prev.amountCents !== toCents) {
        changes.push({
          kind: prev.kind,
          label: split
            ? prev.kind === "finish"
              ? "Final"
              : "Deposit"
            : "Service",
          fromCents: prev.amountCents,
          toCents
        });
      }
    }
    return changes;
  }, [existing, split, amounts]);

  // Clear any stale save message as soon as the owner edits an input.
  useEffect(() => {
    setSaveMessage("");
    setSaveError(false);
  }, [lines, split, depositPercent]);

  function buildInvoiceRecord(
    kind: InvoiceKind,
    now: string,
    assignNumber?: string
  ): InvoiceRecord {
    const prev = existing?.invoices.find((invoice) => invoice.kind === kind);
    // Keep an already-assigned sequential number; otherwise stamp the one
    // reserved for this save.
    const invoiceNumber = prev?.invoiceNumber ?? assignNumber;

    // The paid deposit is frozen: never recompute or reset it. The final
    // absorbs all changes (see computeInvoiceAmounts), so the deposit keeps
    // exactly the amount that was collected, stays paid, and keeps its
    // issued/paid timestamps.
    if (split && kind === "initial" && prev?.status === "paid") {
      return {
        kind,
        amountCents: prev.amountCents,
        status: "paid",
        issuedAt: prev.issuedAt ?? now,
        paidAt: prev.paidAt ?? now,
        invoiceNumber
      };
    }

    const amountForKind = split
      ? kind === "initial"
        ? amounts.initialInvoiceAmountCents
        : amounts.finishInvoiceAmountCents
      : amounts.initialInvoiceAmountCents; // unsplit single service = full contract

    // Reset a previously-paid invoice when its amount changed (see note on
    // paidAmountChanges). The owner must re-mark it paid against the new amount.
    if (prev?.status === "paid" && prev.amountCents !== amountForKind) {
      return {
        kind,
        amountCents: amountForKind,
        status: "unpaid",
        issuedAt: prev.issuedAt ?? now,
        paidAt: null,
        invoiceNumber
      };
    }

    return {
      kind,
      amountCents: amountForKind,
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

    // The split must total 100% (the final is derived as 100 - deposit, so this
    // only fails on a malformed manual value).
    if (split && !amounts.isBalanced) {
      setSaveError(true);
      setSaveMessage(
        `The deposit (${depositPercent}%) and final (${finishPercent}%) percentages must total 100% before saving. They currently total ${amounts.percentTotal}%.`
      );
      return;
    }

    setIsSaving(true);
    setSaveError(false);
    setSaveMessage("");

    const now = new Date().toISOString();

    // Reserve sequential invoice numbers (INV-NNNN) for any record in the
    // current shape that does not already have one. A brand-new setup mints
    // one (unsplit) or two (split); an already-numbered setup re-saved mints
    // none (its numbers are kept, so no gap is burned). One RPC per un-numbered
    // kind, awaited before the write so the numbers land with the save.
    const kinds: InvoiceKind[] = split ? ["initial", "finish"] : ["service"];
    const assignByKind: Partial<Record<InvoiceKind, string>> = {};
    for (const kind of kinds) {
      const prev = existing?.invoices.find((i) => i.kind === kind);
      if (prev?.invoiceNumber) continue;
      try {
        assignByKind[kind] = await nextInvoiceNumber();
      } catch (err) {
        setIsSaving(false);
        setSaveError(true);
        setSaveMessage(
          err instanceof Error ? err.message : "Could not assign an invoice number."
        );
        return;
      }
    }

    const invoices: InvoiceRecord[] = split
      ? [
          buildInvoiceRecord("initial", now, assignByKind.initial),
          buildInvoiceRecord("finish", now, assignByKind.finish)
        ]
      : [buildInvoiceRecord("service", now, assignByKind.service)];

    const data: InvoiceData = {
      quoteType: "service_call",
      contractAmountCents: amountCents,
      // Unused for the unsplit single-invoice shape; for a split these are the
      // deposit / final percentages of the contract.
      roughInPercent: split ? depositPercent : 0,
      finishPercent: split ? finishPercent : 0,
      permitFeeCents: 0,
      generatedAt: now,
      invoices,
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
    if (paidAmountChanges.length > 0) {
      const list = paidAmountChanges
        .map(
          (c) =>
            `${c.label} (was ${formatCurrency(c.fromCents)}, now ${formatCurrency(c.toCents)})`
        )
        .join("; ");
      setSaveMessage(
        `Invoice saved. Paid invoice(s) whose amount changed were reset to unpaid so you can re-mark them paid at the new amount: ${list}.`
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
          The contract is the sum of the line amounts below. Add a description,
          a quantity, and the row amount. No unit price, no permit fee. Then
          choose whether to bill it as one invoice (due on completion) or split
          into a deposit and a final invoice.
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

      {/* Billing schedule — one invoice (due on completion) or split into a
          deposit + final. The split reuses the new-build two-invoice model
          (a % of the contract, paid-deposit freeze). The toggle is locked
          while any invoice is paid so a shape change can't orphan a paid
          record. */}
      <div className="mt-6 rounded-xl1 border border-pine/10 bg-cream p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-clay">
          Billing schedule
        </p>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={split}
            onChange={(event) => setSplit(event.target.checked)}
            disabled={splitLocked}
            className="mt-1 h-4 w-4 accent-pine disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-sm font-bold leading-6 text-charcoal/80">
            Split into a deposit and a final invoice
            <span className="block text-xs font-bold text-charcoal/55">
              Off = one invoice for the full amount, due on completion. On =
              bill a deposit up front and the remainder at finish (e.g. 50% /
              50%).
            </span>
          </span>
        </label>

        {splitLocked ? (
          <p className="mt-3 text-xs font-bold text-charcoal/55">
            A paid invoice is on this job, so the billing schedule can&apos;t be
            changed here. Mark the paid invoice unpaid first if you need to
            switch between one invoice and a deposit/final split.
          </p>
        ) : null}

        {split ? (
          <div className="mt-4">
            {depositPaid ? (
              <div className="mb-3 rounded-soft border border-pine/15 bg-sage/20 p-3 text-sm font-bold leading-6 text-deep-pine">
                The deposit invoice is paid, so its amount is locked. Any change
                you make to the line items here will adjust the final invoice
                only — the paid deposit will not move. The deposit / final split
                is no longer used while the deposit is paid.
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1">
                <span className="text-xs font-black text-deep-pine">
                  Deposit (% of contract)
                </span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={depositPercent === 0 ? "" : depositPercent}
                  onChange={(event) =>
                    setDepositPercent(
                      event.target.value === "" ? 0 : Number(event.target.value)
                    )
                  }
                  placeholder="50"
                  disabled={depositPaid}
                  className="form-input disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <div className="grid min-w-0 gap-1">
                <span className="text-xs font-black text-deep-pine">
                  Final (% of contract)
                </span>
                <input
                  type="text"
                  value={`${finishPercent}%`}
                  readOnly
                  disabled={depositPaid}
                  className="form-input cursor-not-allowed bg-cream/60 text-charcoal/70 disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl1 border border-pine/10 bg-cream p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-clay">
          Invoice amounts (before saving)
        </p>
        {split ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewLine
              label="Invoice 1: Deposit"
              value={formatCurrency(amounts.initialInvoiceAmountCents)}
              sub={
                depositPaid
                  ? "paid and locked"
                  : `${depositPercent}% of contract`
              }
              emphasize
            />
            <PreviewLine
              label="Invoice 2: Final"
              value={formatCurrency(amounts.finishInvoiceAmountCents)}
              sub={
                depositPaid
                  ? "balance after deposit"
                  : `${finishPercent}% of contract`
              }
              emphasize
            />
            <PreviewLine
              label="Lines"
              value={String(lines.length)}
              sub={lines.length === 1 ? "1 line" : `${lines.length} lines`}
            />
            <PreviewLine
              label="Total to collect"
              value={formatCurrency(amounts.totalInvoicedCents)}
              sub="contract"
              emphasize
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewLine
              label="Service Invoice"
              value={formatCurrency(amounts.initialInvoiceAmountCents)}
              sub="sum of line amounts"
              emphasize
            />
            <PreviewLine
              label="Lines"
              value={String(lines.length)}
              sub={lines.length === 1 ? "1 line" : `${lines.length} lines`}
            />
          </div>
        )}

        {split && !amounts.isBalanced ? (
          <p className="mt-3 text-sm font-bold text-clay">
            Warning: deposit ({depositPercent}%) + final ({finishPercent}%) ={" "}
            {amounts.percentTotal}%, which does not total 100%. Adjust the
            deposit so the invoices cover the full contract.
          </p>
        ) : null}
      </div>

      {paidAmountChanges.length > 0 ? (
        <div className="mt-5 rounded-soft border border-clay/30 bg-clay/10 p-4 text-sm font-bold leading-6 text-clay">
          <p className="mb-2">
            Heads up: your changes would change the amount of a paid invoice.
            Saving resets it to unpaid so you can re-mark it paid at the new
            amount (a paid invoice records money already collected, so its
            amount is never changed silently).
          </p>
          <ul className="ml-4 list-disc space-y-1">
            {paidAmountChanges.map((c) => (
              <li key={c.kind}>
                {c.label}: paid at {formatCurrency(c.fromCents)}, would become{" "}
                {formatCurrency(c.toCents)}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-charcoal/65">
          {existing
            ? "Saving updates the line items and invoice amounts, and keeps any paid statuses."
            : split
              ? "This creates the deposit and final invoices for this accepted quote."
              : "This creates the service invoice for this accepted quote."}
        </p>
        <button
          type="button"
          onClick={saveInvoice}
          disabled={isSaving || (split && !amounts.isBalanced)}
          title={
            split && !amounts.isBalanced
              ? "The deposit and final must total 100% before saving"
              : undefined
          }
          className="rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
        >
          {isSaving ? "Saving..." : existing ? "Save Changes" : split ? "Save Invoices" : "Save Invoice"}
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