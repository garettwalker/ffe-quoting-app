"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { computeInvoiceAmounts, invoicePaidCents, invoiceStatusFor } from "@/lib/invoice-calculations";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes after the Phase C pass.
const supabase = getSupabaseBrowser();
import type {
  InvoiceData,
  InvoiceKind,
  InvoiceRecord,
  PricingItem
} from "@/lib/types";
import { CatalogPicker } from "@/components/catalog-picker";
import { FormattedNumberInput } from "@/components/formatted-number-input";

// One editable scope line on the invoice. The name is resolved from the
// catalog by pricingItemId (read-only in the UI); quantity + unit price +
// comment are editable. The contract amount is the sum of (qty * unit price)
// across all lines, so editing a line updates the contract and the two
// invoice amounts flow from the % split as before.
type ScopeLine = {
  pricingItemId: string;
  name: string;
  unitType: string;
  quantity: number;
  unitPriceCents: number;
  comment: string;
  // True for a "Pricing adjustment" line: a single signed amount (stored as
  // quantity 1 x a signed unitPriceCents) that reduces the contract. Rendered
  // with a single amount field instead of qty + unit price.
  isAdjustment?: boolean;
  // Which invoice(s) the adjustment reduces: "both" (split by the rough-in /
  // finish percentages), "rough_in" (only the rough-in invoice), or "finish"
  // (only the finish invoice). Defaults to "both".
  adjustmentTarget?: "both" | "rough_in" | "finish";
};

type InvoiceBuilderProps = {
  quoteId: string;
  // The saved invoice setup, if any. Null means invoices have not been set up.
  initialInvoiceData: InvoiceData | null;
  // The accepted quote total, used to default the contract amount on first
  // setup (and as the manual contract value when there are no line items).
  quoteTotalCents: number;
  // The full pricing-items catalog (active + inactive), used for the
  // "add a line" dropdown. Available-to-add filters to active non-Base items
  // not already on the invoice.
  pricingItems: PricingItem[];
  // The quote's combined pricing-level + contingency multiplier. Used as the
  // default unit price for a line added on the invoice (catalog base price x
  // multiplier) so an added line matches the job's pricing level. The unit
  // price is still editable.
  clientMultiplier: number;
  // The quote's line items, used to seed the invoice's scope the first time
  // invoicing is set up (names + quantities + client prices + comments). Once
  // saved, the scope lives on the invoice (invoice_data.scopeLines) and is
  // edited independently of the quote.
  seedScopeLines: ScopeLine[];
};

// Service invoices have their own builder (ServiceInvoiceBuilder) and never
// use this label map, but Record<InvoiceKind, string> requires all three keys,
// so service is present here for type completeness.
const KIND_LABEL: Record<InvoiceKind, string> = {
  initial: "Rough-In (Invoice 1)",
  finish: "Final (Invoice 2)",
  service: "Service"
};

export function InvoiceBuilder({
  quoteId,
  initialInvoiceData,
  quoteTotalCents,
  pricingItems,
  clientMultiplier,
  seedScopeLines
}: InvoiceBuilderProps) {
  const router = useRouter();
  const existing = initialInvoiceData;

  const [roughInPercent, setRoughInPercent] = useState<number>(
    existing ? existing.roughInPercent : 50
  );
  const [finishPercent, setFinishPercent] = useState<number>(
    existing ? existing.finishPercent : 50
  );
  const [permitDollars, setPermitDollars] = useState<number>(() =>
    existing ? centsToDollars(existing.permitFeeCents) : 0
  );

  // Manual contract amount, used ONLY when there are no scope lines (legacy
  // invoices set up before line items, or an invoice whose lines have all been
  // removed). When scope lines exist the contract is derived from their sum.
  const [contractDollars, setContractDollars] = useState<number>(() =>
    existing ? centsToDollars(existing.contractAmountCents) : centsToDollars(quoteTotalCents)
  );

  // Scope-of-work line items for the invoice. Seeded from the existing
  // invoice's scope if it has one (independent of the quote), otherwise from
  // the quote's line items (first setup). Legacy invoices with no scopeLines
  // start with an empty list (manual contract mode); the owner can add lines
  // to switch to line-item billing.
  const [scopeLines, setScopeLines] = useState<ScopeLine[]>(() => {
    if (Array.isArray(existing?.scopeLines)) {
      return (existing!.scopeLines as ScopeLine[]).map((line) => ({
        pricingItemId: line.pricingItemId ?? "",
        name: line.name,
        unitType: line.unitType ?? "",
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        comment: line.comment,
        isAdjustment: line.isAdjustment,
        adjustmentTarget: line.adjustmentTarget
      }));
    }
    // Legacy invoice (existing contract but no scopeLines): keep it on the
    // manual contract — do NOT seed from the quote, since that could change a
    // (possibly paid) invoice's contract. Brand-new invoice: seed from quote.
    return existing ? [] : seedScopeLines.map((line) => ({ ...line }));
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState(false);

  // Once the rough-in (initial) invoice has money collected against it, its
  // amount is frozen — the money was taken. Any later change to the line items,
  // contract, or permit then flows ONLY to the finish invoice
  // (computeInvoiceAmounts does this: finish = contract + permit - rough-in
  // billed). The rough-in/finish split is bypassed while locked, so the % fields
  // are disabled and the live preview shows the lock instead of the split.
  const roughInInvoice =
    existing?.invoices.find((invoice) => invoice.kind === "initial") ?? null;
  const roughInPaid = roughInInvoice !== null && invoicePaidCents(roughInInvoice) > 0;

  // Starting unit price of each line that was on the form at load, keyed by
  // pricingItemId. Used to catch accidental price edits: when the owner
  // leaves a unit-price field whose value no longer matches its starting
  // price, we confirm before keeping the change (the owner asked for a guard
  // after accidentally editing a price instead of a quantity). Covers lines
  // loaded from the saved invoice AND lines seeded from the quote on a
  // first-time setup. Lines added by the owner during this session are NOT
  // tracked here, so setting the price on a line they just added is not
  // treated as an accidental change.
  const [originalPriceByItemId] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    // Match the scope-lines seeding logic: saved invoice scope if present,
    // else the quote seed for a brand-new setup. A legacy invoice (existing
    // but no scopeLines) starts with no tracked lines.
    const baseline = Array.isArray(existing?.scopeLines)
      ? existing!.scopeLines
      : existing
        ? []
        : seedScopeLines;
    for (const line of baseline) {
      if (line.pricingItemId) map[line.pricingItemId] = line.unitPriceCents;
    }
    return map;
  });

  // The contract is the sum of line totals when there are lines, otherwise the
  // manual contract amount.
  const contractCents = useMemo(() => {
    if (scopeLines.length > 0) {
      return scopeLines.reduce(
        (sum, line) => sum + line.quantity * line.unitPriceCents,
        0
      );
    }
    return dollarsToCents(contractDollars);
  }, [scopeLines, contractDollars]);

  // Clear any stale save message as soon as the owner edits an input.
  useEffect(() => {
    setSaveMessage("");
    setSaveError(false);
  }, [contractDollars, roughInPercent, finishPercent, permitDollars, scopeLines]);

  // Build a preview InvoiceData from the current inputs so amounts update live.
  const previewData: InvoiceData = {
    contractAmountCents: contractCents,
    roughInPercent,
    finishPercent,
    permitFeeCents: dollarsToCents(permitDollars),
    generatedAt: existing?.generatedAt ?? new Date().toISOString(),
    invoices: existing?.invoices ?? [],
    scopeLines
  };

  const amounts = useMemo(
    () => computeInvoiceAmounts(previewData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contractCents, roughInPercent, finishPercent, permitDollars, existing]
  );

  // An invoice with money collected records money that was actually received.
  // If the owner's current inputs would give that invoice a different amount, we
  // do NOT erase the payments: the money stays and the invoice shows a new
  // balance. These are flagged here so the owner is warned before saving (and
  // told what the new balance will be). Invoices with nothing collected are
  // unaffected, and an unchanged invoice is too.
  const collectedAmountChanges = useMemo(() => {
    if (!existing) {
      return [] as {
        kind: InvoiceKind;
        fromCents: number;
        toCents: number;
        collectedCents: number;
      }[];
    }
    const changes: {
      kind: InvoiceKind;
      fromCents: number;
      toCents: number;
      collectedCents: number;
    }[] = [];
    for (const prev of existing.invoices) {
      const collectedCents = invoicePaidCents(prev);
      if (collectedCents <= 0) continue;
      // The rough-in/deposit is frozen while it has payments (handled in
      // buildInvoiceRecord), so it can never produce an amount change. Only the
      // finish invoice's recomputed amount can differ.
      if (prev.kind === "initial") continue;
      const toCents = amounts.finishInvoiceAmountCents;
      if (prev.amountCents !== toCents) {
        changes.push({ kind: prev.kind, fromCents: prev.amountCents, toCents, collectedCents });
      }
    }
    return changes;
  }, [existing, amounts]);

  function buildInvoiceRecord(
    kind: InvoiceKind,
    now: string,
    assignNumber?: string
  ): InvoiceRecord {
    const prev = existing?.invoices.find((invoice) => invoice.kind === kind);
    // Keep an already-assigned sequential number; otherwise stamp the one
    // reserved for this save (undefined when the record already has a number,
    // so re-saving an already-numbered setup never burns a new one).
    const invoiceNumber = prev?.invoiceNumber ?? assignNumber;

    // A rough-in/deposit invoice with money collected is frozen: never
    // recompute or reset it. The finish invoice absorbs all changes (see
    // computeInvoiceAmounts), so the rough-in keeps exactly the amount it was
    // billed at and every payment recorded against it.
    if (kind === "initial" && prev && invoicePaidCents(prev) > 0) {
      return {
        kind,
        amountCents: prev.amountCents,
        status: prev.status,
        paidCents: invoicePaidCents(prev),
        issuedAt: prev.issuedAt ?? now,
        paidAt: prev.paidAt,
        invoiceNumber
      };
    }

    const amountCents =
      kind === "initial"
        ? amounts.initialInvoiceAmountCents
        : amounts.finishInvoiceAmountCents;

    // Money already collected is NEVER erased by an amount change. The invoice
    // keeps it and simply shows a new balance (the owner is warned before
    // saving, see collectedAmountChanges). If the amount drops below what was
    // collected the invoice reads as overpaid, which the UI flags rather than
    // hiding. The flag is derived from the money, so a payment that finishes
    // the invoice keeps it reading Paid.
    const collectedCents = prev ? invoicePaidCents(prev) : 0;

    return {
      kind,
      amountCents,
      status: invoiceStatusFor(collectedCents, amountCents),
      paidCents: collectedCents,
      issuedAt: prev?.issuedAt ?? now,
      paidAt: collectedCents > 0 ? prev?.paidAt ?? now : null,
      invoiceNumber
    };
  }

  // --- Scope line editing -----------------------------------------------
  // Lines are catalog items (name resolved from pricingItemId, read-only).
  // Quantity + unit price + comment are editable. Adding a line picks from the
  // catalog dropdown; the unit price defaults to catalog base x the job's
  // pricing-level multiplier. Editing a line's qty/price updates the contract
  // (sum of line totals) and therefore the invoice amounts; on a paid invoice
  // that changes an amount, the collectedAmountChanges warning applies and the
  // payments recorded against it are kept.
  // Editing only a comment is money-free and never resets anything.

  function resolveName(pricingItemId: string, fallback: string): string {
    if (!pricingItemId) return fallback;
    const item = pricingItems.find((p) => p.id === pricingItemId);
    return item?.name ?? fallback;
  }

  function updateScopeQuantity(index: number, quantity: number) {
    setScopeLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, quantity } : line))
    );
  }

  function updateScopeUnitPrice(index: number, dollars: number) {
    setScopeLines((prev) =>
      prev.map((line, i) =>
        i === index ? { ...line, unitPriceCents: dollarsToCents(dollars) } : line
      )
    );
  }

  // When the owner leaves a unit-price field, confirm the change if the price
  // no longer matches its starting value (catches accidental price edits
  // instead of a quantity edit). Cancel reverts the price to its starting
  // value. Lines the owner added this session have no tracked starting price,
  // so setting their price is not flagged.
  function confirmScopeUnitPrice(index: number) {
    const line = scopeLines[index];
    if (!line || !line.pricingItemId) return;
    const original = originalPriceByItemId[line.pricingItemId];
    if (original === undefined || original === line.unitPriceCents) return;
    const name = resolveName(line.pricingItemId, line.name);
    const ok = window.confirm(
      `You changed the unit price for ${name} from ${formatCurrency(original)} to ${formatCurrency(line.unitPriceCents)}.\n\nKeep this price change?`
    );
    if (!ok) {
      updateScopeUnitPrice(index, centsToDollars(original));
    }
  }

  function updateScopeComment(index: number, comment: string) {
    setScopeLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, comment } : line))
    );
  }

  function updateAdjustmentTarget(
    index: number,
    target: "both" | "rough_in" | "finish"
  ) {
    setScopeLines((prev) =>
      prev.map((line, i) =>
        i === index ? { ...line, adjustmentTarget: target } : line
      )
    );
  }

  function removeScopeLine(index: number) {
    setScopeLines((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If removing the last line, drop back to manual contract mode seeded
      // with the contract the lines were summing to, so the manual field does
      // not jump to zero.
      if (next.length === 0 && prev.length > 0) {
        const sum = prev.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
        setContractDollars(centsToDollars(sum));
      }
      return next;
    });
  }

  // New lines insert at the TOP of the list so they are immediately visible /
  // editable without scrolling (owner request).
  function addScopeLine(pricingItemId: string) {
    const item = pricingItems.find((p) => p.id === pricingItemId);
    if (!item) return;
    setScopeLines((prev) => [
      {
        pricingItemId: item.id,
        name: item.name,
        unitType: item.unitType,
        quantity: 1,
        unitPriceCents: Math.round(item.basePriceCents * clientMultiplier),
        comment: ""
      },
      ...prev
    ]);
  }

  // Add a "Pricing adjustment" line: a single signed amount (negative to
  // reduce the contract) that is not a catalog item. Stored as quantity 1 x a
  // signed unitPriceCents so the existing contract sum (qty x unit price) is
  // unchanged; the line just renders with a single amount field instead of a
  // qty + unit price. The owner picks which invoice(s) it reduces via the
  // target dropdown (default "both").
  function addAdjustmentLine() {
    setScopeLines((prev) => [
      {
        pricingItemId: "",
        name: "Pricing adjustment",
        unitType: "adjustment",
        quantity: 1,
        unitPriceCents: 0,
        comment: "",
        isAdjustment: true,
        adjustmentTarget: "both"
      },
      ...prev
    ]);
  }

  // Active catalog adders not already on the invoice (by pricingItemId). The
  // base package is a seeded pseudo-item, not in the catalog, so it never
  // appears here.
  const availableItems = pricingItems.filter(
    (item) =>
      item.active &&
      item.category !== "Base" &&
      !scopeLines.some((line) => line.pricingItemId === item.id)
  );

  async function saveInvoices() {
    if (isSaving) return;

    // Do not allow saving until the rough-in and finish split totals 100%.
    if (!amounts.isBalanced) {
      setSaveError(true);
      setSaveMessage(
        `The rough-in (${roughInPercent}%) and finish (${finishPercent}%) percentages must total 100% before saving. They currently total ${amounts.percentTotal}%.`
      );
      return;
    }

    setIsSaving(true);
    setSaveError(false);
    setSaveMessage("");

    const now = new Date().toISOString();

    // Reserve sequential invoice numbers (INV-NNNN) for any record that does
    // not already have one. A brand-new setup mints two (initial then finish);
    // a pre-feature setup being re-saved mints numbers for its un-numbered
    // records (lazy backfill); an already-numbered setup re-saved mints none
    // (its numbers are kept, so no gap is burned). One RPC per un-numbered
    // kind, awaited before the write so the numbers land with the save.
    const kinds: InvoiceKind[] = ["initial", "finish"];
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

    const data: InvoiceData = {
      contractAmountCents: contractCents,
      roughInPercent,
      finishPercent,
      permitFeeCents: dollarsToCents(permitDollars),
      generatedAt: now,
      invoices: [
        buildInvoiceRecord("initial", now, assignByKind.initial),
        buildInvoiceRecord("finish", now, assignByKind.finish)
      ],
      // Persist the invoice's own scope lines when there are any, so the
      // invoice is independent of the quote from this save onward. When there
      // are no lines, keep the prior scope state: a legacy invoice that never
      // had lines stays without scopeLines (PDF backfills from the quote),
      // while an invoice whose lines were cleared saves an empty array (the
      // owner's clear is respected, no quote backfill).
      ...(scopeLines.length > 0
        ? {
            scopeLines: scopeLines.map((line) => ({
              pricingItemId: line.pricingItemId,
              name: line.name.trim(),
              unitType: line.unitType,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              comment: line.comment.trim(),
              ...(line.isAdjustment
                ? {
                    isAdjustment: true,
                    adjustmentTarget: line.adjustmentTarget ?? "both"
                  }
                : {})
            }))
          }
        : Array.isArray(existing?.scopeLines)
          ? { scopeLines: [] }
          : {})
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
    if (collectedAmountChanges.length > 0) {
      const list = collectedAmountChanges
        .map((c) => {
          const label = KIND_LABEL[c.kind];
          const from = formatCurrency(c.fromCents);
          const to = formatCurrency(c.toCents);
          const balance = formatCurrency(Math.max(0, c.toCents - c.collectedCents));
          return `${label} (was ${from}, now ${to}, ${formatCurrency(c.collectedCents)} already collected so ${balance} remains due)`;
        })
        .join("; ");
      setSaveMessage(
        `Invoices saved. Payments already recorded were kept, so the invoice(s) below now show a new balance: ${list}.`
      );
    } else {
      setSaveMessage("Invoices saved. Adjust and save again any time.");
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
          Line items, split, and permit fee
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          {roughInPaid
            ? "The contract is the sum of the line items below. The rough-in invoice has payments recorded and is locked, so any change you make to the line items, contract, or permit fee adjusts the final invoice only. Add line items from your pricing catalog and set quantity and price."
            : "The contract is the sum of the line items below. The initial invoice is the rough-in percent of that contract plus the permit fee; the final invoice is the remainder. Add line items from your pricing catalog, set quantity and price, and adjust the split."}
        </p>
      </div>

      {/* Line items — same detail as the quote's customer-facing line items
          (Item / Qty / Unit / Unit Price / Line Total). Pulled from the
          pricing catalog; quantity + unit price + comment are editable. The
          contract is the sum of the line totals (shown in the table footer). */}
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
          Line Items
        </p>
        <p className="text-xs font-bold text-charcoal/55">
          Pulled from your pricing catalog. Quantities and prices are editable;
          the contract is the sum of the line totals.
        </p>
      </div>

      <div className="responsive-table-wrap overflow-hidden rounded-xl1 border border-pine/10">
        <table className="responsive-table w-full border-collapse text-left text-sm">
          <thead className="bg-sand text-deep-pine">
            <tr>
              <th className="p-3 font-black">Item</th>
              <th className="p-3 font-black">Qty</th>
              <th className="p-3 font-black">Unit</th>
              <th className="p-3 font-black">Unit Price</th>
              <th className="p-3 font-black">Line Total</th>
              <th className="p-3" aria-hidden></th>
            </tr>
          </thead>
          <tbody className="bg-cream">
            {scopeLines.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-sm font-bold text-charcoal/55">
                  No line items yet. Add one from the catalog below, or enter a
                  contract amount in the split section to bill a lump sum.
                </td>
              </tr>
            ) : (
              scopeLines.map((line, index) => {
                const name = resolveName(line.pricingItemId, line.name);
                const lineTotalCents = line.quantity * line.unitPriceCents;
                return (
                  <Fragment key={index}>
                    <tr>
                      <td className="min-w-0 p-3 align-top">
                        <p className="break-words font-black text-deep-pine">{name}</p>
                      </td>
                      <td className="p-3 align-top">
                        {line.isAdjustment ? (
                          <span className="text-charcoal/55">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={line.quantity === 0 ? "" : line.quantity}
                              onChange={(event) =>
                                updateScopeQuantity(
                                  index,
                                  event.target.value === "" ? 0 : Number(event.target.value)
                                )
                              }
                              placeholder="1"
                              aria-label="Quantity"
                              className="form-input w-20"
                            />
                            <span className="text-xs font-bold text-charcoal/55">qty</span>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 align-top text-charcoal/70">
                        {line.isAdjustment ? (
                          <select
                            value={line.adjustmentTarget ?? "both"}
                            onChange={(event) =>
                              updateAdjustmentTarget(
                                index,
                                event.target.value as "both" | "rough_in" | "finish"
                              )
                            }
                            aria-label="Which invoice does this adjustment affect?"
                            title="Which invoice does this adjustment affect?"
                            className="form-input w-44"
                          >
                            <option value="both">Both invoices</option>
                            <option value="rough_in">Rough-in only</option>
                            <option value="finish">Finish only</option>
                          </select>
                        ) : (
                          line.unitType
                        )}
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-charcoal/55">$</span>
                          <FormattedNumberInput
                            value={centsToDollars(line.unitPriceCents)}
                            onChange={(dollars) => updateScopeUnitPrice(index, dollars)}
                            onBlur={() => confirmScopeUnitPrice(index)}
                            allowDecimal
                            allowNegative={line.isAdjustment}
                            min={line.isAdjustment ? undefined : 0}
                            placeholder="0"
                            aria-label={
                              line.isAdjustment
                                ? "Adjustment amount in dollars"
                                : "Unit price in dollars"
                            }
                            className="form-input w-24"
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap p-3 align-top font-black text-deep-pine">
                        {formatCurrency(lineTotalCents)}
                      </td>
                      <td className="p-3 align-top">
                        <button
                          type="button"
                          onClick={() => removeScopeLine(index)}
                          title="Remove this line item"
                          className="rounded-full border border-clay/30 px-3 py-2 text-xs font-black text-clay hover:bg-clay/10"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                    {/* Comment row — spans the full width of the table so the
                        customer-facing note sits beneath the whole line item. */}
                    <tr>
                      <td colSpan={6} className="border-b border-pine/10 p-3 pt-0">
                        <textarea
                          value={line.comment}
                          onChange={(event) =>
                            updateScopeComment(index, event.target.value)
                          }
                          placeholder="Customer-facing note (optional)"
                          rows={2}
                          className="form-input w-full max-w-full resize-y text-xs"
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
          {scopeLines.length > 0 ? (
            <tfoot className="bg-sand">
              <tr>
                <td
                  colSpan={4}
                  className="p-3 text-right font-black uppercase tracking-[0.1em] text-deep-pine"
                >
                  Contract (sum of line items)
                </td>
                <td className="whitespace-nowrap p-3 font-display text-lg font-bold text-deep-pine">
                  {formatCurrency(contractCents)}
                </td>
                <td className="p-3" aria-hidden></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          {availableItems.length > 0 ? (
            <CatalogPicker
              items={availableItems}
              onPick={addScopeLine}
              label="Add a line item"
              emptyLabel="All catalog adders are already on this invoice."
            />
          ) : (
            <p className="text-sm font-bold text-charcoal/55">
              All catalog adders are already on this invoice.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={addAdjustmentLine}
          className="rounded-full border border-pine/20 bg-whitewarm px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          + Add pricing adjustment
        </button>
      </div>

      {/* Split + permit. The contract is the sum of the line items above; when
          there are no line items, a manual contract amount is used instead.
          Once the rough-in invoice has payments recorded, the rough-in/finish
          split is bypassed (the finish absorbs any change), so the % fields are
          locked. */}
      {roughInPaid ? (
        <div className="mt-6 rounded-soft border border-pine/15 bg-sage/20 p-4 text-sm font-bold leading-6 text-deep-pine">
          The rough-in invoice has payments recorded, so its amount is locked.
          Any change you make to the line items, contract, or permit fee here
          will adjust the finish invoice only, and the payments already recorded
          on the rough-in will not move. The rough-in / finish split is no longer
          used while the rough-in is locked.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {scopeLines.length === 0 ? (
          <Field label="Contract Amount ($)">
            <FormattedNumberInput
              value={contractDollars}
              onChange={setContractDollars}
              allowDecimal
              min={0}
              placeholder="Enter contract amount"
              className="form-input"
            />
          </Field>
        ) : null}

        <Field label="Permit Fee ($)">
          <FormattedNumberInput
            value={permitDollars}
            onChange={setPermitDollars}
            allowDecimal
            min={0}
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
            disabled={roughInPaid}
            className="form-input disabled:cursor-not-allowed disabled:opacity-60"
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
            disabled={roughInPaid}
            className="form-input disabled:cursor-not-allowed disabled:opacity-60"
          />
        </Field>
      </div>

      <div className="mt-5 rounded-xl1 border border-pine/10 bg-cream p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-clay">
          Invoice amounts (before saving)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PreviewLine
            label="Invoice 1: Rough-In"
            value={formatCurrency(amounts.initialInvoiceAmountCents)}
            sub={roughInPaid ? "payments recorded, locked" : `${roughInPercent}% + permit`}
            emphasize
          />
          <PreviewLine
            label="Invoice 2: Final"
            value={formatCurrency(amounts.finishInvoiceAmountCents)}
            sub={
              roughInPaid
                ? "balance after rough-in"
                : `${finishPercent}% of contract`
            }
            emphasize
          />
          <PreviewLine
            label="Permit fee (in Invoice 1)"
            value={formatCurrency(dollarsToCents(permitDollars))}
            sub={roughInPaid ? "in the locked rough-in" : "collected with rough-in"}
          />
          <PreviewLine
            label="Total to collect"
            value={formatCurrency(amounts.totalInvoicedCents)}
            sub="contract + permit"
            emphasize
          />
        </div>

        <div className="mt-3 text-sm font-bold">
          {roughInPaid ? (
            <p className="text-deep-pine">
              Rough-in is locked at{" "}
              {formatCurrency(amounts.initialInvoiceAmountCents)}. The final
              invoice carries the remaining{" "}
              {formatCurrency(amounts.finishInvoiceAmountCents)} of the{" "}
              {formatCurrency(amounts.totalInvoicedCents)} total.
            </p>
          ) : amounts.isBalanced ? (
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

      {collectedAmountChanges.length > 0 ? (
        <div className="mt-5 rounded-soft border border-clay/30 bg-clay/10 p-4 text-sm font-bold leading-6 text-clay">
          <p className="mb-2">
            Heads up: your changes would change the amount of an invoice that
            already has payments recorded against it. Saving keeps every payment
            (a payment is never erased by an amount change) and the invoice will
            simply show a new balance.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            {collectedAmountChanges.map((c) => (
              <li key={c.kind}>
                {KIND_LABEL[c.kind]}: {formatCurrency(c.fromCents)} becomes{" "}
                {formatCurrency(c.toCents)}, with{" "}
                {formatCurrency(c.collectedCents)} already collected.
                {c.toCents >= c.collectedCents
                  ? ` The new balance will be ${formatCurrency(c.toCents - c.collectedCents)}.`
                  : ` That is less than what was collected, so the invoice will read as overpaid by ${formatCurrency(c.collectedCents - c.toCents)}.`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-charcoal/65">
          {existing
            ? "Saving updates the line items, contract, and invoice amounts, and keeps every payment already recorded."
            : "This creates the two invoices for this accepted quote."}
        </p>
        <button
          type="button"
          onClick={saveInvoices}
          disabled={isSaving || !amounts.isBalanced}
          title={
            amounts.isBalanced
              ? undefined
              : "The split must total 100% before saving"
          }
          className="rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
        >
          {isSaving ? "Saving..." : existing ? "Save Changes" : "Save Invoices"}
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