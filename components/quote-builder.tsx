"use client";

import { useMemo, useState } from "react";
import { calculateQuote } from "@/lib/calculations";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import {
  contingencyOptions,
  defaultQuoteNotes,
  pricingLevels,
  projectTypes
} from "@/lib/seed-data";
import type { BasePricingMode, QuoteFormState } from "@/lib/types";
import { QuoteLineItemPicker } from "@/components/quote-line-item-picker";
import { QuoteTotalsPanel } from "@/components/quote-totals-panel";

const today = new Date().toISOString().slice(0, 10);

function createDraftQuote(): QuoteFormState {
  return {
    quoteId: generateTemporaryQuoteId(),
    quoteDate: today,
    clientName: "",
    clientEmail: "",
    projectAddress: "",
    projectType: "Custom Home",
    squareFootage: 0,
    basePricingMode: "auto",
    manualBaseRateCents: 600,
    highCeilingOrComplexSwitching: false,
    pricingLevelId: "standard-custom",
    contingencyId: "contingency-0",
    internalNotes: "",
    lineItems: []
  };
}

export function QuoteBuilder() {
  const [quote, setQuote] = useState<QuoteFormState>(() => createDraftQuote());

  const result = useMemo(() => calculateQuote(quote), [quote]);

  function updateQuote<K extends keyof QuoteFormState>(
    key: K,
    value: QuoteFormState[K]
  ) {
    setQuote((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleAddLineItem(pricingItemId: string) {
    setQuote((current) => ({
      ...current,
      lineItems: [
        ...current.lineItems,
        {
          pricingItemId,
          quantity: 1
        }
      ]
    }));
  }

  function handleUpdateQuantity(pricingItemId: string, quantity: number) {
    setQuote((current) => ({
      ...current,
      lineItems: current.lineItems.map((lineItem) =>
        lineItem.pricingItemId === pricingItemId
          ? {
              ...lineItem,
              quantity
            }
          : lineItem
      )
    }));
  }

  function handleRemoveLineItem(pricingItemId: string) {
    setQuote((current) => ({
      ...current,
      lineItems: current.lineItems.filter(
        (lineItem) => lineItem.pricingItemId !== pricingItemId
      )
    }));
  }

  function resetQuote() {
    setQuote(createDraftQuote());
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
                Quote Details
              </p>
              <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
                Project and client information.
              </h2>
            </div>

            <button
              type="button"
              onClick={resetQuote}
              className="rounded-full border border-pine/20 bg-whitewarm px-5 py-3 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              Reset Quote
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Quote ID">
              <input
                value={quote.quoteId}
                onChange={(event) => updateQuote("quoteId", event.target.value)}
                className="form-input"
              />
            </Field>

            <Field label="Quote Date">
              <input
                type="date"
                value={quote.quoteDate}
                onChange={(event) =>
                  updateQuote("quoteDate", event.target.value)
                }
                className="form-input"
              />
            </Field>

            <Field label="Client Name">
              <input
                value={quote.clientName}
                onChange={(event) =>
                  updateQuote("clientName", event.target.value)
                }
                placeholder="Client or builder name"
                className="form-input"
              />
            </Field>

            <Field label="Client Email">
              <input
                type="email"
                value={quote.clientEmail}
                onChange={(event) =>
                  updateQuote("clientEmail", event.target.value)
                }
                placeholder="client@email.com"
                className="form-input"
              />
            </Field>

            <Field label="Project Address">
              <input
                value={quote.projectAddress}
                onChange={(event) =>
                  updateQuote("projectAddress", event.target.value)
                }
                placeholder="Project location"
                className="form-input"
              />
            </Field>

            <Field label="Project Type">
              <select
                value={quote.projectType}
                onChange={(event) =>
                  updateQuote("projectType", event.target.value)
                }
                className="form-input"
              >
                {projectTypes.map((projectType) => (
                  <option key={projectType} value={projectType}>
                    {projectType}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <div className="mb-6">
            <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Pricing Setup
            </p>
            <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
              Base rate, pricing level, and contingency.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Square Footage">
              <input
                type="number"
                min="0"
                value={quote.squareFootage}
                onChange={(event) =>
                  updateQuote("squareFootage", Number(event.target.value))
                }
                className="form-input"
              />
            </Field>

            <Field label="Base Pricing Mode">
              <select
                value={quote.basePricingMode}
                onChange={(event) =>
                  updateQuote(
                    "basePricingMode",
                    event.target.value as BasePricingMode
                  )
                }
                className="form-input"
              >
                <option value="auto">Auto</option>
                <option value="builder">Builder/Spec</option>
                <option value="manual">Manual</option>
              </select>
            </Field>

            {quote.basePricingMode === "manual" ? (
              <Field label="Manual Base Rate">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={centsToDollars(quote.manualBaseRateCents)}
                  onChange={(event) =>
                    updateQuote(
                      "manualBaseRateCents",
                      dollarsToCents(Number(event.target.value))
                    )
                  }
                  className="form-input"
                />
              </Field>
            ) : null}

            <Field label="High Ceiling / Complex Switching">
              <select
                value={quote.highCeilingOrComplexSwitching ? "yes" : "no"}
                onChange={(event) =>
                  updateQuote(
                    "highCeilingOrComplexSwitching",
                    event.target.value === "yes"
                  )
                }
                className="form-input"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>

            <Field label="Pricing Level">
              <select
                value={quote.pricingLevelId}
                onChange={(event) =>
                  updateQuote("pricingLevelId", event.target.value)
                }
                className="form-input"
              >
                {pricingLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name} - {level.description}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Contingency">
              <select
                value={quote.contingencyId}
                onChange={(event) =>
                  updateQuote("contingencyId", event.target.value)
                }
                className="form-input"
              >
                {contingencyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <QuoteLineItemPicker
          lineItems={quote.lineItems}
          onAddLineItem={handleAddLineItem}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveLineItem={handleRemoveLineItem}
        />

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Customer-Facing Detail
          </p>

          <div className="overflow-hidden rounded-xl1 border border-pine/10">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-sand text-deep-pine">
                <tr>
                  <th className="p-3 font-black">Item</th>
                  <th className="p-3 font-black">Qty</th>
                  <th className="p-3 font-black">Unit</th>
                  <th className="p-3 font-black">Unit Price</th>
                  <th className="p-3 font-black">Line Total</th>
                  <th className="p-3 font-black">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pine/10 bg-cream">
                {result.clientFacingLines.map((line) => (
                  <tr key={line.pricingItemId}>
                    <td className="p-3 font-bold text-charcoal">{line.name}</td>
                    <td className="p-3">{line.quantity.toLocaleString()}</td>
                    <td className="p-3">{line.unitType}</td>
                    <td className="p-3">
                      {formatCurrency(line.clientUnitPriceCents)}
                    </td>
                    <td className="p-3 font-black text-deep-pine">
                      {formatCurrency(line.clientLineTotalCents)}
                    </td>
                    <td className="p-3 text-charcoal/65">{line.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-soft bg-sand p-4 text-sm font-bold text-charcoal/75">
            {defaultQuoteNotes}
          </div>
        </section>
      </div>

      <QuoteTotalsPanel result={result} />
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-deep-pine">{label}</span>
      {children}
    </label>
  );
}

function generateTemporaryQuoteId(): string {
  const date = new Date();
  const yyyymmdd = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `Q-${yyyymmdd}-001`;
}
