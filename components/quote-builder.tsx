"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calculateQuote } from "@/lib/calculations";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import {
  clearActiveQuote,
  getActiveQuote,
  saveActiveQuote
} from "@/lib/quote-storage";
import { resolveQuoteIdForSave } from "@/lib/quote-id";
import { supabase } from "@/lib/supabase";
import type { BasePricingMode, PricingCatalog, QuoteFormState } from "@/lib/types";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { QuoteLineItemPicker } from "@/components/quote-line-item-picker";
import { QuoteTotalsPanel } from "@/components/quote-totals-panel";

const today = new Date().toISOString().slice(0, 10);

function createDraftQuote(): QuoteFormState {
  return {
    quoteId: "",
    quoteDate: today,
    clientName: "",
    clientEmail: "",
    projectStreet: "",
    projectCity: "",
    projectState: "NC",
    projectZip: "",
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

type QuoteBuilderProps = {
  // When provided, the builder opens in edit mode prefilled with this saved
  // quote and ignores the browser's active-quote storage for initial load.
  initialQuote?: QuoteFormState;
  // The Supabase row id of the saved quote being edited, if any.
  savedQuoteId?: string;
  // The live pricing catalog (items, levels, contingencies, project types,
  // settings) fetched from Supabase by the server-component page and passed
  // down. Replaces the old static lib/seed-data.ts imports.
  catalog: PricingCatalog;
};

export function QuoteBuilder({
  initialQuote,
  savedQuoteId: savedQuoteIdProp,
  catalog
}: QuoteBuilderProps) {
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteFormState>(
    () => initialQuote ?? createDraftQuote()
  );
  const [savedQuoteId, setSavedQuoteId] = useState<string | undefined>(
    savedQuoteIdProp
  );
  const [completionMessage, setCompletionMessage] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [hasLoadedStoredQuote, setHasLoadedStoredQuote] = useState(() =>
    Boolean(initialQuote)
  );

  useEffect(() => {
    if (initialQuote) {
      // Edit mode: initial state was set from the prop. Do not pull from storage.
      setHasLoadedStoredQuote(true);
      return;
    }

    const storedQuote = getActiveQuote();

    if (storedQuote) {
      setQuote(storedQuote.quote);
      if (storedQuote.savedQuoteId) {
        setSavedQuoteId(storedQuote.savedQuoteId);
      }
      setHasLoadedStoredQuote(true);
      return;
    }

    // Truly new quote: the quote id is left blank and assigned by the server at
    // save time (see resolveQuoteIdForSave), so the owner does not see a number
    // until the quote is actually saved and two people saving at once can never
    // collide on the same id.
    setHasLoadedStoredQuote(true);
  }, [initialQuote]);

  const result = useMemo(
    () =>
      calculateQuote(quote, catalog.items, catalog.levels, catalog.contingencies),
    [quote, catalog]
  );

  function updateQuote<K extends keyof QuoteFormState>(
    key: K,
    value: QuoteFormState[K]
  ) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleAddLineItem(pricingItemId: string) {
    setCompletionMessage("");
    setDraftMessage("");
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
    setCompletionMessage("");
    setDraftMessage("");
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
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      lineItems: current.lineItems.filter(
        (lineItem) => lineItem.pricingItemId !== pricingItemId
      )
    }));
  }

  function resetQuote() {
    clearActiveQuote();
    setSavedQuoteId(undefined);
    setCompletionMessage("");
    setQuote(createDraftQuote());
  }

  function completeQuote() {
    if (!quote.clientName.trim()) {
      setCompletionMessage("Add a client name before completing the quote.");
      return;
    }

    if (!quote.projectStreet.trim()) {
      setCompletionMessage(
        "Add the project street address before completing the quote."
      );
      return;
    }

    if (!quote.projectCity.trim()) {
      setCompletionMessage("Add the project city before completing the quote.");
      return;
    }

    if (!quote.projectState.trim()) {
      setCompletionMessage("Add the project state before completing the quote.");
      return;
    }

    if (!quote.projectZip.trim()) {
      setCompletionMessage("Add the project ZIP code before completing the quote.");
      return;
    }

    if (quote.squareFootage <= 0) {
      setCompletionMessage(
        "Enter the project square footage before completing the quote."
      );
      return;
    }

    saveActiveQuote(quote, result, savedQuoteId);
    router.push("/quotes/review");
  }

  // Save the current form to Supabase as a draft (status: "draft"). Drafts
  // only require a client name; the other fields keep whatever is entered (the
  // table's NOT NULL columns accept empty strings and 0). On success the
  // browser working copy is cleared and the saved row becomes the source of
  // truth, so the builder switches to "editing a saved quote" mode.
  async function saveDraftToSupabase() {
    if (isSavingDraft) return;

    if (!quote.clientName.trim()) {
      setDraftMessage("Add a client name before saving a draft.");
      return;
    }

    setIsSavingDraft(true);
    setDraftMessage("");

    // Resolve the quote id: keep a custom id the owner typed, otherwise ask the
    // server for the next atomic daily number. Done before the payload is
    // built so the assigned id is what gets persisted (and remembered in the
    // form so a follow-up re-save reuses it instead of asking again).
    let resolvedQuoteId: string;
    try {
      resolvedQuoteId = await resolveQuoteIdForSave(quote.quoteId);
    } catch (err) {
      setDraftMessage(
        `Draft save failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setIsSavingDraft(false);
      return;
    }
    setQuote((current) => ({ ...current, quoteId: resolvedQuoteId }));

    const payload = {
      quote_id: resolvedQuoteId,
      quote_date: quote.quoteDate,
      client_name: quote.clientName,
      client_email: quote.clientEmail || null,
      project_street: quote.projectStreet,
      project_city: quote.projectCity,
      project_state: quote.projectState,
      project_zip: quote.projectZip,
      project_type: quote.projectType,
      square_footage: quote.squareFootage,
      base_pricing_mode: quote.basePricingMode,
      manual_base_rate_cents: quote.manualBaseRateCents,
      high_ceiling_or_complex_switching: quote.highCeilingOrComplexSwitching,
      pricing_level_id: quote.pricingLevelId,
      contingency_id: quote.contingencyId,
      internal_notes: quote.internalNotes || null,
      quote_data: { ...quote, quoteId: resolvedQuoteId },
      calculation_data: result,
      client_quote_total_cents: result.clientQuoteTotalCents,
      status: "draft",
      updated_at: new Date().toISOString()
    };

    try {
      if (savedQuoteId) {
        // Update the existing saved row (could be a draft or a prepared quote
        // reopened for editing). Saving as draft moves it back to In-progress.
        const { error } = await supabase
          .from("quotes")
          .update(payload)
          .eq("id", savedQuoteId);

        if (error) {
          setDraftMessage(`Draft update failed: ${error.message}`);
          setIsSavingDraft(false);
          return;
        }
      } else {
        // Insert a new draft and remember its id so further saves update it.
        const { data, error } = await supabase
          .from("quotes")
          .insert(payload)
          .select("id")
          .single();

        if (error || !data) {
          setDraftMessage(
            `Draft save failed: ${error ? error.message : "Unknown error"}`
          );
          setIsSavingDraft(false);
          return;
        }

        setSavedQuoteId(data.id);
      }

      clearActiveQuote();
      setDraftMessage(
        "Draft saved. Find it under In-progress on the dashboard."
      );
      setIsSavingDraft(false);
    } catch (err) {
      setDraftMessage(
        `Draft save failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setIsSavingDraft(false);
    }
  }

  if (!hasLoadedStoredQuote) {
    return (
      <div className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
        <p className="font-bold text-charcoal/70">Loading quote...</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        {savedQuoteId ? (
          <div className="rounded-soft border border-clay/25 bg-cream/70 px-4 py-3 text-sm font-black text-clay">
            Editing a saved quote. Saving will update the existing quote
            instead of creating a new one.
          </div>
        ) : null}

        {catalog.items.length === 0 ? (
          <div className="rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-black text-clay">
            Pricing is not configured. Add pricing items in the{" "}
            <Link href="/pricing-admin" className="underline">
              pricing admin
            </Link>{" "}
            page before building a quote.
          </div>
        ) : null}

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
                placeholder="Assigned on save"
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

            <Field label="Address">
              <input
                value={quote.projectStreet}
                onChange={(event) =>
                  updateQuote("projectStreet", event.target.value)
                }
                placeholder="Street address"
                className="form-input"
              />
            </Field>

            <Field label="City">
              <input
                value={quote.projectCity}
                onChange={(event) =>
                  updateQuote("projectCity", event.target.value)
                }
                placeholder="City"
                className="form-input"
              />
            </Field>

            <Field label="State">
              <input
                value={quote.projectState}
                onChange={(event) =>
                  updateQuote("projectState", event.target.value.toUpperCase())
                }
                maxLength={2}
                placeholder="NC"
                className="form-input"
              />
            </Field>

            <Field label="ZIP Code">
              <input
                inputMode="numeric"
                value={quote.projectZip}
                onChange={(event) =>
                  updateQuote("projectZip", event.target.value)
                }
                placeholder="27021"
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
                {catalog.projectTypes
                  .filter(
                    (projectType) =>
                      projectType.active ||
                      projectType.name === quote.projectType
                  )
                  .map((projectType) => (
                    <option key={projectType.id} value={projectType.name}>
                      {projectType.name}
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
              <FormattedNumberInput
                value={quote.squareFootage}
                onChange={(value) => updateQuote("squareFootage", value)}
                min={0}
                placeholder="Enter sq ft"
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
                  value={
                    quote.manualBaseRateCents === 0
                      ? ""
                      : centsToDollars(quote.manualBaseRateCents)
                  }
                  onChange={(event) =>
                    updateQuote(
                      "manualBaseRateCents",
                      event.target.value === ""
                        ? 0
                        : dollarsToCents(Number(event.target.value))
                    )
                  }
                  placeholder="Enter rate per sq ft"
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
                {catalog.levels
                  .filter(
                    (level) => level.active || level.id === quote.pricingLevelId
                  )
                  .map((level) => (
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
                {catalog.contingencies
                  .filter(
                    (option) =>
                      option.active || option.id === quote.contingencyId
                  )
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </section>

        <QuoteLineItemPicker
          items={catalog.items}
          lineItems={quote.lineItems}
          onAddLineItem={handleAddLineItem}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveLineItem={handleRemoveLineItem}
        />

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Customer-Facing Detail
          </p>

          <div className="responsive-table-wrap rounded-xl1 border border-pine/10">
            <table className="responsive-table w-full border-collapse text-left text-sm">
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
            {catalog.settings.defaultQuoteNotes}
          </div>
        </section>

        <section className="rounded-xl2 border border-clay/25 bg-whitewarm/75 p-6 shadow-card">
          <div className="mb-4">
            <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Internal Notes
            </p>
            <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
              Owner notes (not shown to customer)
            </h2>
            <p className="mt-2 text-sm font-bold text-charcoal/60">
              Any reminders or context for you. These stay private and will not
              appear on customer-facing quotes or PDFs.
            </p>
          </div>

          <textarea
            value={quote.internalNotes}
            onChange={(event) =>
              updateQuote("internalNotes", event.target.value)
            }
            placeholder="Optional notes for the owner only..."
            className="form-input min-h-32 resize-y py-3"
          />
        </section>

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
                Save or complete
              </p>
              <p className="font-bold text-charcoal/70">
                Save a draft to keep working later, or complete the quote to
                review and prepare it for the customer.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveDraftToSupabase}
                disabled={isSavingDraft}
                className="rounded-full border border-pine/20 px-6 py-3 font-black text-deep-pine hover:bg-pine hover:text-whitewarm disabled:cursor-default disabled:opacity-60"
              >
                {isSavingDraft ? "Saving draft..." : "Save as draft"}
              </button>

              <button
                type="button"
                onClick={completeQuote}
                className="rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine"
              >
                Complete Quote
              </button>
            </div>
          </div>

          {draftMessage ? (
            <div className="mt-5 rounded-soft border border-pine/15 bg-sage/20 p-4 font-bold text-deep-pine">
              {draftMessage}
            </div>
          ) : null}

          {completionMessage ? (
            <div className="mt-5 rounded-soft border border-pine/15 bg-sage/20 p-4 font-bold text-deep-pine">
              {completionMessage}
            </div>
          ) : null}
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
    <label className="grid min-w-0 gap-2">
      <span className="text-sm font-black text-deep-pine">{label}</span>
      {children}
    </label>
  );
}