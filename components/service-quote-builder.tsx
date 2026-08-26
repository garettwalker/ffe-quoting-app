"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calculateServiceQuote } from "@/lib/calculations";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import {
  clearActiveQuote,
  getActiveQuote,
  saveActiveQuote
} from "@/lib/quote-storage";
import { resolveQuoteIdForSave } from "@/lib/quote-id";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type {
  Customer,
  ProjectType,
  QuoteFormState,
  ServiceLine
} from "@/lib/types";
import { FormattedNumberInput } from "@/components/formatted-number-input";
import { CustomerPicker } from "@/components/customer-picker";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes.
const supabase = getSupabaseBrowser();

const today = new Date().toISOString().slice(0, 10);

// New service-call draft. The pricing levers (baseRate/pricingLevel/
// contingency/squareFootage/lineItems) are unused for service calls; they are
// left at their defaults so the QuoteFormState shape is complete. The freeform
// lines live in `serviceLines`.
function createDraftServiceQuote(): QuoteFormState {
  return {
    quoteId: "",
    quoteDate: today,
    quoteType: "service_call",
    clientName: "",
    clientEmail: "",
    projectName: "",
    projectStreet: "",
    projectCity: "",
    projectState: "NC",
    projectZip: "",
    projectType: "Service Call",
    squareFootage: 0,
    pricingLevelId: "standard-custom",
    contingencyId: "contingency-0",
    internalNotes: "",
    lineItems: [],
    serviceLines: []
  };
}

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

type ServiceQuoteBuilderProps = {
  // When provided, the builder opens in edit mode prefilled with this saved
  // quote and ignores the browser's active-quote storage for initial load.
  initialQuote?: QuoteFormState;
  // The Supabase row id of the saved quote being edited, if any.
  savedQuoteId?: string;
  // The customer repository (smart-search + create-new + autofill).
  customers: Customer[];
  // Project-type options from the catalog (for the dropdown). The service
  // builder does NOT need pricing items/levels/contingencies.
  projectTypes: ProjectType[];
  // The default customer-facing quote notes from app_settings.
  defaultQuoteNotes: string;
};

export function ServiceQuoteBuilder({
  initialQuote,
  savedQuoteId: savedQuoteIdProp,
  customers,
  projectTypes,
  defaultQuoteNotes
}: ServiceQuoteBuilderProps) {
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteFormState>(() =>
    initialQuote ? { ...initialQuote } : createDraftServiceQuote()
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
      setHasLoadedStoredQuote(true);
      return;
    }

    const storedQuote = getActiveQuote();

    // Only resume a stored draft that is actually a service-call draft. A
    // new-build draft in localStorage is left alone (the owner is starting a
    // service call explicitly); this builder starts fresh instead of clobbering
    // it, and the new-build draft remains resumable from the chooser.
    if (storedQuote && storedQuote.quote.quoteType === "service_call") {
      setQuote(storedQuote.quote);
      if (storedQuote.savedQuoteId) {
        setSavedQuoteId(storedQuote.savedQuoteId);
      }
    }
    setHasLoadedStoredQuote(true);
  }, [initialQuote]);

  const result = useMemo(() => calculateServiceQuote(quote), [quote]);

  function updateQuote<K extends keyof QuoteFormState>(
    key: K,
    value: QuoteFormState[K]
  ) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({ ...current, [key]: value }));
  }

  // Customer-picker handlers (mirrors the new-build builder).
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
      clientEmail: customer.emails[0]?.email ?? current.clientEmail
    }));
  }

  function handleCustomerCreated(customer: Customer) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      clientName: customer.name,
      customerId: customer.id
    }));
  }

  // Freeform line handlers.
  function handleAddLine() {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      serviceLines: [
        ...current.serviceLines,
        {
          id: newLineId(),
          name: "",
          quantity: 1,
          amountCents: 0,
          comment: ""
        }
      ]
    }));
  }

  function handleUpdateLine(id: string, patch: Partial<ServiceLine>) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      serviceLines: current.serviceLines.map((line) =>
        line.id === id ? { ...line, ...patch } : line
      )
    }));
  }

  function handleRemoveLine(id: string) {
    setCompletionMessage("");
    setDraftMessage("");
    setQuote((current) => ({
      ...current,
      serviceLines: current.serviceLines.filter((line) => line.id !== id)
    }));
  }

  function resetQuote() {
    clearActiveQuote();
    setSavedQuoteId(undefined);
    setCompletionMessage("");
    setQuote(createDraftServiceQuote());
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
    // Service calls require at least one line with a description. A zero-dollar
    // line is allowed (a no-charge / warranty item), but an empty description
    // means the owner has not actually entered the work.
    const realLines = quote.serviceLines.filter((line) =>
      line.name.trim().length > 0
    );
    if (realLines.length === 0) {
      setCompletionMessage(
        "Add at least one line item with a description before completing the quote."
      );
      return;
    }

    // Persist only lines with a description so blank trailing rows do not
    // carry into the saved quote / review.
    const cleaned: QuoteFormState = {
      ...quote,
      serviceLines: realLines.map((line) => ({
        id: line.id,
        name: line.name.trim(),
        quantity: line.quantity,
        amountCents: line.amountCents,
        comment: line.comment?.trim() || undefined
      }))
    };

    saveActiveQuote(cleaned, calculateServiceQuote(cleaned), savedQuoteId);
    router.push("/quotes/review");
  }

  // Save the current form to Supabase as a draft (status: "draft"). Drafts only
  // require a client name; the other fields keep whatever is entered.
  async function saveDraftToSupabase() {
    if (isSavingDraft) return;

    if (!quote.clientName.trim()) {
      setDraftMessage("Add a client name before saving a draft.");
      return;
    }

    setIsSavingDraft(true);
    setDraftMessage("");

    let resolvedQuoteId: string;
    try {
      resolvedQuoteId = await resolveQuoteIdForSave(
        quote.quoteId,
        quote.quoteDate,
        savedQuoteId
      );
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
      quote_type: "service_call" as const,
      client_name: quote.clientName,
      client_email: quote.clientEmail || null,
      customer_id: quote.customerId ?? null,
      project_name: quote.projectName || null,
      project_street: quote.projectStreet,
      project_city: quote.projectCity,
      project_state: quote.projectState,
      project_zip: quote.projectZip,
      project_type: quote.projectType,
      square_footage: 0,
      base_pricing_mode: "auto",
      manual_base_rate_cents: 0,
      high_ceiling_or_complex_switching: false,
      pricing_level_id: quote.pricingLevelId,
      contingency_id: quote.contingencyId,
      internal_notes: quote.internalNotes || null,
      quote_data: { ...quote, quoteId: resolvedQuoteId, quoteType: "service_call" },
      calculation_data: result,
      client_quote_total_cents: result.clientQuoteTotalCents,
      status: "draft",
      updated_at: new Date().toISOString()
    };

    try {
      if (savedQuoteId) {
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
      setDraftMessage("Draft saved. Find it under In-progress on the dashboard.");
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
                {projectTypes
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
                {projectTypes.every((p) => p.name !== quote.projectType) ? (
                  <option value={quote.projectType}>{quote.projectType}</option>
                ) : null}
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
                Line Items
              </p>
              <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
                Freeform line items.
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-charcoal/70">
                Add a description, a quantity, and the row amount. The quote
                total is the sum of the row amounts. No unit price, no pricing
                levers.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddLine}
              className="rounded-full border border-pine/20 bg-whitewarm px-5 py-3 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              + Add line
            </button>
          </div>

          {quote.serviceLines.length === 0 ? (
            <div className="rounded-soft border border-pine/15 bg-cream px-4 py-8 text-center text-sm font-bold text-charcoal/60">
              No line items yet. Click &quot;Add line&quot; to add the first one.
            </div>
          ) : (
            <div className="space-y-4">
              {quote.serviceLines.map((line, index) => (
                <ServiceLineRow
                  key={line.id}
                  index={index}
                  line={line}
                  onUpdate={(patch) => handleUpdateLine(line.id, patch)}
                  onRemove={() => handleRemoveLine(line.id)}
                  canRemove={quote.serviceLines.length > 1}
                />
              ))}
            </div>
          )}

          <div className="mt-5 rounded-soft bg-sand p-4 text-sm font-bold text-charcoal/75">
            {defaultQuoteNotes}
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

      <aside className="rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-card lg:sticky lg:top-28">
        <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Quote Total
        </p>
        <p className="font-display text-5xl font-bold tracking-[-0.04em] text-deep-pine">
          {formatCurrency(result.clientQuoteTotalCents)}
        </p>
        <p className="mt-2 text-sm font-bold text-charcoal/60">
          {result.lines.length} line{result.lines.length === 1 ? "" : "s"}
        </p>

        <div className="mt-6 space-y-2 border-t border-pine/10 pt-4 text-sm">
          {result.lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate font-bold text-charcoal/70">
                {line.name || "Untitled line"}
              </span>
              <span className="font-black text-deep-pine">
                {formatCurrency(line.amountCents)}
              </span>
            </div>
          ))}
          {result.lines.length === 0 ? (
            <p className="font-bold text-charcoal/50">No lines yet.</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ServiceLineRow({
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
          placeholder="Optional note shown under this line on the quote"
          className="form-input"
        />
      </label>
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