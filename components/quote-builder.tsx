"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calculateQuote, deriveLegacyBaseRate } from "@/lib/calculations";
import { DEFAULT_BASE_RATES } from "@/lib/base-rates";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import {
  clearActiveQuote,
  getActiveQuote,
  saveActiveQuote
} from "@/lib/quote-storage";
import { resolveQuoteIdForSave } from "@/lib/quote-id";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes after the Phase C pass.
const supabase = getSupabaseBrowser();
import type {
  BaseRate,
  Customer,
  PricingCatalog,
  QuoteFormState
} from "@/lib/types";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { CustomerPicker } from "@/components/customer-picker";
import { QuoteLineItemPicker } from "@/components/quote-line-item-picker";
import { QuoteTotalsPanel } from "@/components/quote-totals-panel";

const today = new Date().toISOString().slice(0, 10);

function createDraftQuote(): QuoteFormState {
  return {
    quoteId: "",
    quoteDate: today,
    quoteType: "new_build",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    projectName: "",
    projectStreet: "",
    projectCity: "",
    projectState: "NC",
    projectZip: "",
    projectType: "Custom Home",
    squareFootage: 0,
    // The primary price lever. New quotes start at the default $6.00/sf
    // "Standard" preset; the owner picks a different preset or a custom rate
    // in the Pricing Setup section. The legacy auto fields are deliberately
    // omitted on new quotes (they are optional now).
    baseRateCents: 600,
    baseRateLabel: "Standard",
    baseRateId: null,
    pricingLevelId: "standard-custom",
    contingencyId: "contingency-0",
    internalNotes: "",
    lineItems: [],
    // Unused on new builds (service calls carry freeform lines here). Kept
    // empty so the QuoteFormState shape is always complete.
    serviceLines: []
  };
}

// Backfill the new base-rate fields on a quote saved before they existed.
// Quotes saved under the old model only carry basePricingMode +
// manualBaseRateCents + highCeilingOrComplexSwitching; deriveLegacyBaseRate
// replays that logic so the rate the quote was built with is preserved until
// it is re-saved. baseRateId is left null (a custom/derived rate has no
// preset). A quote that already has baseRateCents is returned untouched.
function normalizeLegacyQuote(input: QuoteFormState): QuoteFormState {
  if (
    typeof input.baseRateCents === "number" &&
    Number.isFinite(input.baseRateCents) &&
    input.baseRateCents > 0
  ) {
    return input;
  }
  const legacy = deriveLegacyBaseRate(input);
  return {
    ...input,
    baseRateCents: legacy.cents,
    baseRateLabel: legacy.label,
    baseRateId: null
  };
}

// If a quote's rate (cents) happens to exactly match one of the admin presets,
// link it to that preset (set baseRateId + the preset's label) so the dropdown
// shows the preset as selected and the manual-rate box stays hidden. This is
// the "manual rate only applies when you DON'T pick a numerical choice" rule:
// a new quote defaults to $6, which matches the Standard preset, so it opens
// with Standard selected — not in custom mode. Runs only on initial load
// (new quote, loaded saved quote, or resumed browser draft); typing a custom
// rate later intentionally stays in custom mode even if it matches a preset.
// A quote already linked to a preset (baseRateId set) is left alone.
function adoptBaseRatePreset(
  input: QuoteFormState,
  baseRates: BaseRate[]
): QuoteFormState {
  if (input.baseRateId) return input;
  const match = baseRates.find(
    (rate) => rate.active && rate.rateCents === input.baseRateCents
  );
  if (match) {
    return { ...input, baseRateId: match.id, baseRateLabel: match.name };
  }
  return input;
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
  // The customer repository, fetched by the server page and passed down so the
  // Builder / Customer field can smart-search existing customers and link the
  // quote to one. Empty when none exist yet (the picker still offers create-new).
  customers: Customer[];
};

export function QuoteBuilder({
  initialQuote,
  savedQuoteId: savedQuoteIdProp,
  catalog,
  customers
}: QuoteBuilderProps) {
  const router = useRouter();
  // The DB is the source of truth for base-rate presets when it has rows; when
  // the base_rates table is empty/missing (migration not run, fresh env) fall
  // back to the built-in DEFAULT_BASE_RATES so the dropdown is never empty.
  // Pricing Admin does NOT get this fallback — it shows the real DB state.
  const effectiveBaseRates =
    catalog.baseRates.length > 0 ? catalog.baseRates : DEFAULT_BASE_RATES;
  const [quote, setQuote] = useState<QuoteFormState>(() =>
    initialQuote
      ? adoptBaseRatePreset(normalizeLegacyQuote(initialQuote), effectiveBaseRates)
      : adoptBaseRatePreset(createDraftQuote(), effectiveBaseRates)
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

    // Only resume a stored draft that is NOT a service-call draft. A service
    // call draft in localStorage is left alone (the owner is starting a new
    // build explicitly); this builder starts fresh instead of clobbering it,
    // and the service draft remains resumable from the chooser.
    if (storedQuote && storedQuote.quote.quoteType !== "service_call") {
      setQuote(
        adoptBaseRatePreset(
          normalizeLegacyQuote(storedQuote.quote),
          effectiveBaseRates
        )
      );
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

  // Set the base-rate lever. The rate is stored as a snapshot (cents + a label
  // + the preset id, or null for a custom/manual rate). Clears the stale
  // draft/save messages the same way updateQuote does.
  function changeBaseRate(next: {
    baseRateId: string | null;
    baseRateLabel: string;
    baseRateCents: number;
  }) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({ ...current, ...next }));
  }

  // Customer-picker handlers. The quote keeps its own client_name / client_email
  // snapshot; customer_id is just the link to the shared record.
  //  - Pick existing: snapshot the name + primary email, set the link.
  //  - Create new (picker does the insert): snapshot the name, set the link.
  //  - Type a name different from the linked customer: unlink (name is identity)
  //    so the dropdown re-offers matches / create-new.
  function handleCustomerNameChange(name: string) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => {
      let customerId = current.customerId;
      if (customerId) {
        const linked = customers.find((c) => c.id === customerId);
        if (linked && linked.name !== name) {
          customerId = undefined;
        }
      }
      return { ...current, clientName: name, customerId };
    });
  }

  function handleCustomerSelect(customer: Customer) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      clientName: customer.name,
      customerId: customer.id,
      // Prefill the contact email with the customer's primary email. Keep an
      // email the owner already typed when the customer has none on file.
      clientEmail: customer.emails[0]?.email ?? current.clientEmail,
      // Prefill the phone from the linked customer record (same snapshot rule
      // as email; keep an owner-typed value when the customer has none).
      clientPhone: customer.phone ?? current.clientPhone
    }));
  }

  function handleCustomerCreated(customer: Customer) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      clientName: customer.name,
      customerId: customer.id,
      clientPhone: customer.phone ?? current.clientPhone
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
          quantity: 1,
          comment: ""
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

  function handleUpdateComment(pricingItemId: string, comment: string) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      lineItems: current.lineItems.map((lineItem) =>
        lineItem.pricingItemId === pricingItemId
          ? {
              ...lineItem,
              comment
            }
          : lineItem
      )
    }));
  }

  function handleUpdateUnitPrice(pricingItemId: string, unitPriceCents: number) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      lineItems: current.lineItems.map((lineItem) =>
        lineItem.pricingItemId === pricingItemId
          ? {
              ...lineItem,
              unitPriceCents
            }
          : lineItem
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

    // Resolve the quote id: keep a custom id the owner typed; otherwise, if we
    // are updating an existing saved quote, keep its existing id; otherwise ask
    // the server for the next atomic daily number. Done before the payload is
    // built so the assigned id is what gets persisted (and remembered in the
    // form so a follow-up re-save reuses it instead of asking again).
    let resolvedQuoteId: string;
    try {
      resolvedQuoteId = await resolveQuoteIdForSave(quote.quoteId, quote.quoteDate, savedQuoteId);
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
      quote_type: quote.quoteType ?? "new_build",
      client_name: quote.clientName,
      client_email: quote.clientEmail || null,
      customer_id: quote.customerId ?? null,
      project_name: quote.projectName || null,
      project_street: quote.projectStreet,
      project_city: quote.projectCity,
      project_state: quote.projectState,
      project_zip: quote.projectZip,
      project_type: quote.projectType,
      square_footage: quote.squareFootage,
      base_pricing_mode: quote.basePricingMode ?? "auto",
      manual_base_rate_cents: quote.manualBaseRateCents ?? quote.baseRateCents ?? 600,
      high_ceiling_or_complex_switching: quote.highCeilingOrComplexSwitching ?? false,
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

  // The linked customer's emails, offered as a datalist on the contact-email
  // field so the quote contact can be the wife's email (or any second contact)
  // with one keystroke. Empty when no customer is linked or it has no emails.
  const linkedCustomerEmails = quote.customerId
    ? customers.find((c) => c.id === quote.customerId)?.emails.map((e) => e.email) ?? []
    : [];

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
                readOnly
                placeholder="Assigned on save"
                className="form-input cursor-not-allowed bg-sand/60 text-charcoal/70"
              />
              <span className="text-xs font-bold text-charcoal/50">
                Assigned automatically when you save. It cannot be edited.
              </span>
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

            <Field label="Project Name">
              <input
                value={quote.projectName}
                onChange={(event) =>
                  updateQuote("projectName", event.target.value)
                }
                placeholder="e.g. Fulk Residence"
                className="form-input"
              />
            </Field>

            <Field label="Builder / Customer">
              <CustomerPicker
                customers={customers}
                value={quote.clientName}
                customerId={quote.customerId}
                clientEmail={quote.clientEmail}
                onChange={handleCustomerNameChange}
                onSelect={handleCustomerSelect}
                onCreated={handleCustomerCreated}
              />
            </Field>

            <Field label="Builder / Customer Email">
              <input
                type="email"
                value={quote.clientEmail}
                onChange={(event) =>
                  updateQuote("clientEmail", event.target.value)
                }
                placeholder="client@email.com"
                className="form-input"
                list={
                  linkedCustomerEmails.length > 0
                    ? "customer-email-options"
                    : undefined
                }
              />
              {linkedCustomerEmails.length > 0 ? (
                <datalist id="customer-email-options">
                  {linkedCustomerEmails.map((email) => (
                    <option key={email} value={email} />
                  ))}
                </datalist>
              ) : null}
            </Field>

            <Field label="Builder / Customer Phone">
              <input
                type="tel"
                value={quote.clientPhone ?? ""}
                onChange={(event) =>
                  updateQuote("clientPhone", event.target.value)
                }
                placeholder="Optional phone number"
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
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-charcoal/70">
              Three levers control the price. The <strong>Base Rate</strong> sets
              the per-square-foot price of the Base Package only. The{" "}
              <strong>Pricing Level</strong> and <strong>Contingency</strong> are
              multipliers that apply to the Base Package <em>and</em> every adder,
              except adder lines you have given a custom unit price (those keep
              their custom price and ignore the multipliers). Pick a preset or
              enter any custom $/sf.
            </p>
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

            <Field label="Base Rate (per sq ft)">
              <select
                value={
                  effectiveBaseRates.find((r) => r.id === quote.baseRateId)?.id ??
                  "__custom"
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "__custom") {
                    changeBaseRate({
                      baseRateId: null,
                      baseRateLabel: "Custom base rate",
                      baseRateCents: quote.baseRateCents ?? 600
                    });
                  } else {
                    const preset = effectiveBaseRates.find(
                      (rate) => rate.id === value
                    );
                    if (preset) {
                      changeBaseRate({
                        baseRateId: preset.id,
                        baseRateLabel: preset.name,
                        baseRateCents: preset.rateCents
                      });
                    }
                  }
                }}
                className="form-input"
              >
                {effectiveBaseRates
                  .filter(
                    (rate) => rate.active || rate.id === quote.baseRateId
                  )
                  .map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name} - {formatCurrency(rate.rateCents)}/sf
                    </option>
                  ))}
                <option value="__custom">Custom rate...</option>
              </select>
              <p className="text-xs font-bold leading-4 text-charcoal/55">
                Affects the Base Package only. Adders are not changed.
              </p>
            </Field>

            {!effectiveBaseRates.find((r) => r.id === quote.baseRateId) ? (
              <Field label="Custom Base Rate ($/sf)">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-charcoal/55">$</span>
                  <FormattedNumberInput
                    value={centsToDollars(quote.baseRateCents ?? 600)}
                    onChange={(dollars) =>
                      changeBaseRate({
                        baseRateCents: dollarsToCents(dollars),
                        baseRateLabel: "Custom base rate",
                        baseRateId: null
                      })
                    }
                    allowDecimal
                    min={0}
                    placeholder="Enter rate per sq ft"
                    className="form-input"
                  />
                </div>
                <p className="text-xs font-bold leading-4 text-charcoal/55">
                  Affects the Base Package only. Adders are not changed.
                </p>
              </Field>
            ) : null}

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
              <p className="text-xs font-bold leading-4 text-charcoal/55">
                Multiplier on the Base Package and all adders (except custom-priced
                adder lines).
              </p>
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
                    (option) => option.active || option.id === quote.contingencyId
                  )
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs font-bold leading-4 text-charcoal/55">
                Multiplier on the Base Package and all adders (except custom-priced
                adder lines).
              </p>
            </Field>
          </div>
        </section>

        <QuoteLineItemPicker
          items={catalog.items}
          lineItems={quote.lineItems}
          clientMultiplier={result.combinedClientMultiplier}
          onAddLineItem={handleAddLineItem}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateUnitPrice={handleUpdateUnitPrice}
          onUpdateComment={handleUpdateComment}
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
                    <td className="p-3 font-bold text-charcoal">
                      <div>{line.name}</div>
                      {line.comment ? (
                        <div className="mt-1 break-words text-xs font-medium italic leading-5 text-charcoal/60">
                          {line.comment}
                        </div>
                      ) : null}
                    </td>
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