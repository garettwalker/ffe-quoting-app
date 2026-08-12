"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { computeInvoiceAmounts } from "@/lib/invoice-calculations";
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

const KIND_LABEL: Record<InvoiceKind, string> = {
  initial: "Initial (Rough-In)",
  finish: "Finish"
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
        comment: line.comment
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

  // A paid invoice records money that was actually collected. If the owner's
  // current inputs would give that invoice a different amount, saving must NOT
  // silently rewrite the collected amount while leaving the "paid" badge in
  // place (that would make AR and the dashboard report money never collected).
  // Instead we flag those invoices here so we can (1) warn the owner before the
  // save and (2) reset them to unpaid on save so they re-mark it paid at the new
  // amount. Unpaid invoices are unaffected; an unchanged paid invoice is too.
  const paidAmountChanges = useMemo(() => {
    if (!existing) return [] as { kind: InvoiceKind; fromCents: number; toCents: number }[];
    const changes: { kind: InvoiceKind; fromCents: number; toCents: number }[] = [];
    for (const prev of existing.invoices) {
      if (prev.status !== "paid") continue;
      const toCents =
        prev.kind === "initial"
          ? amounts.initialInvoiceAmountCents
          : amounts.finishInvoiceAmountCents;
      if (prev.amountCents !== toCents) {
        changes.push({ kind: prev.kind, fromCents: prev.amountCents, toCents });
      }
    }
    return changes;
  }, [existing, amounts]);

  function buildInvoiceRecord(kind: InvoiceKind, now: string): InvoiceRecord {
    const prev = existing?.invoices.find((invoice) => invoice.kind === kind);
    const amountCents =
      kind === "initial"
        ? amounts.initialInvoiceAmountCents
        : amounts.finishInvoiceAmountCents;

    // Reset a previously-paid invoice when its amount changes (see note on
    // paidAmountChanges). The owner must re-mark it paid against the new amount.
    if (prev?.status === "paid" && prev.amountCents !== amountCents) {
      return {
        kind,
        amountCents,
        status: "unpaid",
        issuedAt: prev.issuedAt ?? now,
        paidAt: null
      };
    }

    return {
      kind,
      amountCents,
      // Preserve paid status and timestamps across setup edits.
      status: prev?.status ?? "unpaid",
      issuedAt: prev?.issuedAt ?? now,
      paidAt: prev?.paidAt ?? null
    };
  }

  // --- Scope line editing -----------------------------------------------
  // Lines are catalog items (name resolved from pricingItemId, read-only).
  // Quantity + unit price + comment are editable. Adding a line picks from the
  // catalog dropdown; the unit price defaults to catalog base x the job's
  // pricing-level multiplier. Editing a line's qty/price updates the contract
  // (sum of line totals) and therefore the invoice amounts; on a paid invoice
  // that changes an amount, the paidAmountChanges warning + reset applies.
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

  function updateScopeComment(index: number, comment: string) {
    setScopeLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, comment } : line))
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

  function addScopeLine(pricingItemId: string) {
    const item = pricingItems.find((p) => p.id === pricingItemId);
    if (!item) return;
    setScopeLines((prev) => [
      ...prev,
      {
        pricingItemId: item.id,
        name: item.name,
        unitType: item.unitType,
        quantity: 1,
        unitPriceCents: Math.round(item.basePriceCents * clientMultiplier),
        comment: ""
      }
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
    const data: InvoiceData = {
      contractAmountCents: contractCents,
      roughInPercent,
      finishPercent,
      permitFeeCents: dollarsToCents(permitDollars),
      generatedAt: now,
      invoices: [buildInvoiceRecord("initial", now), buildInvoiceRecord("finish", now)],
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
              comment: line.comment.trim()
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
    if (paidAmountChanges.length > 0) {
      const list = paidAmountChanges
        .map((c) => {
          const label = KIND_LABEL[c.kind];
          const from = formatCurrency(c.fromCents);
          const to = formatCurrency(c.toCents);
          return `${label} (was ${from}, now ${to})`;
        })
        .join("; ");
      setSaveMessage(
        `Invoices saved. Paid invoice(s) whose amount changed were reset to unpaid so you can re-mark them paid at the new amount: ${list}.`
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
          The contract is the sum of the line items below. The initial invoice
          is the rough-in percent of that contract plus the permit fee; the
          finish invoice is the remainder. Add line items from your pricing
          catalog, set quantity and price, and adjust the split.
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
          <tbody className="divide-y divide-pine/10 bg-cream">
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
                  <tr key={index}>
                    <td className="min-w-0 p-3 align-top">
                      <p className="break-words font-black text-deep-pine">{name}</p>
                      <textarea
                        value={line.comment}
                        onChange={(event) =>
                          updateScopeComment(index, event.target.value)
                        }
                        placeholder="Customer-facing note (optional)"
                        rows={2}
                        className="form-input mt-2 w-full max-w-full resize-y text-xs"
                      />
                    </td>
                    <td className="p-3 align-top">
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
                        className="form-input w-24"
                      />
                    </td>
                    <td className="whitespace-nowrap p-3 align-top text-charcoal/70">
                      {line.unitType}
                    </td>
                    <td className="p-3 align-top">
                      <FormattedNumberInput
                        value={centsToDollars(line.unitPriceCents)}
                        onChange={(dollars) => updateScopeUnitPrice(index, dollars)}
                        allowDecimal
                        min={0}
                        placeholder="0"
                        className="form-input w-28"
                      />
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

      {availableItems.length > 0 ? (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-black uppercase tracking-[0.1em] text-deep-pine">
            Add a line item
          </label>
          <select
            className="form-input min-h-12"
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) return;
              addScopeLine(event.target.value);
              event.target.value = "";
            }}
          >
            <option value="">Choose an item from the catalog...</option>
            {availableItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category} - {item.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="mt-3 text-sm font-bold text-charcoal/55">
          All catalog adders are already on this invoice.
        </p>
      )}

      {/* Split + permit. The contract is the sum of the line items above; when
          there are no line items, a manual contract amount is used instead. */}
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
                {KIND_LABEL[c.kind]}: paid at {formatCurrency(c.fromCents)}, would
                become {formatCurrency(c.toCents)}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-charcoal/65">
          {existing
            ? "Saving updates the line items, contract, and invoice amounts, and keeps any paid statuses."
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