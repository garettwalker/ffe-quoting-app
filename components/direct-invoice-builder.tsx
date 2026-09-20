"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import {
  clearActiveQuote,
  getActiveQuote,
  saveActiveQuote
} from "@/lib/quote-storage";
import { resolveQuoteIdForSave } from "@/lib/quote-id";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type {
  Customer,
  InvoiceData,
  InvoiceRecord,
  QuoteFormState,
  ServiceLine
} from "@/lib/types";
import { CatalogPicker, type CatalogPickerItem } from "@/components/catalog-picker";
import { CustomerPicker } from "@/components/customer-picker";
import { FormattedNumberInput } from "@/components/formatted-number-input";

// Authenticated browser client (singleton). Carries the logged-in user's
// session so RLS enforces admin-only writes.
const supabase = getSupabaseBrowser();

const today = new Date().toISOString().slice(0, 10);

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

// New direct-invoice draft. Shaped like a service-call QuoteFormState (the
// shared working-copy slot + save payload reuse that shape) with
// quoteType "direct_invoice". The pricing levers are unused; the address and
// project type are optional extras (an invoice needs a payee and lines only).
function createDraftDirectInvoice(): QuoteFormState {
  return {
    quoteId: "",
    quoteDate: today,
    quoteType: "direct_invoice",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
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

type DirectInvoiceBuilderProps =
  | {
      // Create mode (/quotes/new?type=direct_invoice): one step builds the
      // whole thing — customer fields + manual line items + a single
      // kind "service" invoice — and INSERTS the quotes row (status
      // "accepted" + invoice_data in one save).
      mode: "create";
      // Active non-Base catalog items offered to prefill a line (prefill
      // only — every field stays editable, and a blank freeform line needs
      // no catalog item at all).
      catalogItems: CatalogPickerItem[];
      customers: Customer[];
    }
  | {
      // Edit mode (embedded on /quotes/[id]/invoices): edits the invoice's
      // own lines (invoice_data.serviceLines — the living copy) on a saved
      // direct-invoice row. Customer/project fields are the creation-time
      // snapshot and are not edited here (same convention as quotes).
      mode: "edit";
      quoteId: string;
      initialInvoiceData: InvoiceData | null;
    };

// Direct invoice: an invoice created WITHOUT a quote first. Fully manual
// line items (description · qty · unit price → amount, everything editable),
// optionally prefilled from the pricing catalog. Single invoice (kind
// "service", due on completion), INV-NNNN numbered, saved in one step with
// status "accepted" + invoice_data. Reuses the service-call invoice
// machinery everywhere downstream (PDF, Stripe, email, AR, project tracker).
export function DirectInvoiceBuilder(props: DirectInvoiceBuilderProps) {
  if (props.mode === "edit") {
    return (
      <DirectInvoiceEdit
        quoteId={props.quoteId}
        initialInvoiceData={props.initialInvoiceData}
      />
    );
  }
  return (
    <DirectInvoiceCreate
      catalogItems={props.catalogItems}
      customers={props.customers}
    />
  );
}

// --- Create mode -----------------------------------------------------------

function DirectInvoiceCreate({
  catalogItems,
  customers
}: {
  catalogItems: CatalogPickerItem[];
  customers: Customer[];
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteFormState>(createDraftDirectInvoice);
  const [hasLoadedStoredQuote, setHasLoadedStoredQuote] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const storedQuote = getActiveQuote();

    // Only resume a stored draft that is actually a direct-invoice draft. A
    // new-build / service-call draft in localStorage is left alone (this
    // builder starts fresh instead of clobbering it; the other draft remains
    // resumable from the chooser).
    if (storedQuote && storedQuote.quote.quoteType === "direct_invoice") {
      setQuote(storedQuote.quote);
    }
    setHasLoadedStoredQuote(true);
  }, []);

  // Persist the working copy on every change so a refresh mid-build loses
  // nothing (the create flow has no separate review step to save from).
  useEffect(() => {
    if (!hasLoadedStoredQuote) return;
    saveActiveQuote(
      quote,
      { clientQuoteTotalCents: directInvoiceTotal(quote), lines: quote.serviceLines },
      null
    );
  }, [quote, hasLoadedStoredQuote]);

  const lines = quote.serviceLines;

  // The invoice amount = the sum of qty x unit price across the lines.
  const amountCents = useMemo(() => directInvoiceTotal(quote), [quote]);

  const availableItems = useMemo(
    () =>
      catalogItems.filter(
        (item) => !lines.some((line) => line.name === item.name)
      ),
    [catalogItems, lines]
  );

  function updateQuote<K extends keyof QuoteFormState>(
    key: K,
    value: QuoteFormState[K]
  ) {
    setSaveMessage("");
    setSaveError(false);
    setQuote((current) => ({ ...current, [key]: value }));
  }

  // Customer-picker handlers (mirrors the other builders).
  function handleCustomerNameChange(name: string) {
    setSaveMessage("");
    setSaveError(false);
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
    setSaveMessage("");
    setSaveError(false);
    setQuote((current) => ({
      ...current,
      clientName: customer.name,
      customerId: customer.id,
      clientEmail: customer.emails[0]?.email ?? current.clientEmail,
      clientPhone: customer.phone ?? current.clientPhone
    }));
  }

  function handleCustomerCreated(customer: Customer) {
    setSaveMessage("");
    setSaveError(false);
    setQuote((current) => ({
      ...current,
      clientName: customer.name,
      customerId: customer.id,
      clientPhone: customer.phone ?? current.clientPhone
    }));
  }

  // Add a catalog line (prefill: description + qty 1 + the catalog list
  // price — no pricing-level multiplier, a direct invoice has none) or a
  // blank freeform line. New lines insert AT THE TOP so the fresh row is
  // visible without scrolling.
  function handleCatalogPick(pricingItemId: string) {
    const item = catalogItems.find((catalogItem) => catalogItem.id === pricingItemId);
    if (!item) return;
    setSaveMessage("");
    setSaveError(false);
    setQuote((current) => ({
      ...current,
      serviceLines: [
        {
          id: newLineId(),
          name: item.name,
          quantity: 1,
          amountCents: item.basePriceCents,
          unitPriceCents: item.basePriceCents,
          comment: ""
        },
        ...current.serviceLines
      ]
    }));
  }

  function handleAddBlankLine() {
    setSaveMessage("");
    setSaveError(false);
    setQuote((current) => ({
      ...current,
      serviceLines: [
        {
          id: newLineId(),
          name: "",
          quantity: 1,
          amountCents: 0,
          unitPriceCents: 0,
          comment: ""
        },
        ...current.serviceLines
      ]
    }));
  }

  function handleUpdateLine(id: string, patch: Partial<ServiceLine>) {
    setSaveMessage("");
    setSaveError(false);
    setQuote((current) => ({
      ...current,
      serviceLines: current.serviceLines.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        return {
          ...next,
          // The amount is always derived from qty x unit price so the two can
          // never disagree (mirrors the service-quote builder).
          amountCents: Math.round(next.quantity * (next.unitPriceCents ?? 0))
        };
      })
    }));
  }

  function handleRemoveLine(id: string) {
    setSaveMessage("");
    setSaveError(false);
    setQuote((current) => ({
      ...current,
      serviceLines: current.serviceLines.filter((line) => line.id !== id)
    }));
  }

  function resetInvoice() {
    clearActiveQuote();
    setSaveMessage("");
    setSaveError(false);
    setQuote(createDraftDirectInvoice());
  }

  async function saveInvoice() {
    if (isSaving) return;

    if (!quote.clientName.trim()) {
      setSaveError(true);
      setSaveMessage("Add the Builder / Customer (who the invoice bills) before saving.");
      return;
    }

    const realLines = quote.serviceLines.filter((line) => line.name.trim().length > 0);
    if (realLines.length === 0) {
      setSaveError(true);
      setSaveMessage(
        "Add at least one line item with a description before saving the invoice."
      );
      return;
    }

    setIsSaving(true);
    setSaveError(false);
    setSaveMessage("");

    const now = new Date().toISOString();
    const cleanedLines = realLines.map((line) => cleanLine(line));
    const contractCents = cleanedLines.reduce(
      (sum, line) => sum + line.amountCents,
      0
    );

    let resolvedQuoteId: string;
    try {
      resolvedQuoteId = await resolveQuoteIdForSave("", quote.quoteDate, null);
    } catch (err) {
      setSaveError(true);
      setSaveMessage(
        `Save failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setIsSaving(false);
      return;
    }

    let invoiceNumber: string;
    try {
      invoiceNumber = await nextInvoiceNumber();
    } catch (err) {
      setSaveError(true);
      setSaveMessage(
        err instanceof Error ? err.message : "Could not assign an invoice number."
      );
      setIsSaving(false);
      return;
    }

    const invoiceData: InvoiceData = {
      quoteType: "direct_invoice",
      contractAmountCents: contractCents,
      roughInPercent: 0,
      finishPercent: 0,
      permitFeeCents: 0,
      generatedAt: now,
      invoices: [
        {
          kind: "service",
          amountCents: contractCents,
          status: "unpaid",
          issuedAt: now,
          paidAt: null,
          invoiceNumber
        }
      ],
      serviceLines: cleanedLines
    };

    const quoteData: QuoteFormState = {
      ...quote,
      quoteId: resolvedQuoteId,
      quoteType: "direct_invoice",
      serviceLines: cleanedLines
    };
    const calculationData = {
      clientQuoteTotalCents: contractCents,
      lines: cleanedLines
    };

    const payload = {
      quote_id: resolvedQuoteId,
      quote_date: quote.quoteDate,
      quote_type: "direct_invoice" as const,
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
      quote_data: quoteData,
      calculation_data: calculationData,
      client_quote_total_cents: contractCents,
      status: "accepted",
      invoice_data: invoiceData,
      updated_at: now
    };

    const { data, error } = await supabase
      .from("quotes")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) {
      setSaveError(true);
      setSaveMessage(
        `Save failed: ${error ? error.message : "Unknown error"}`
      );
      setIsSaving(false);
      return;
    }

    clearActiveQuote();
    router.push(`/quotes/${data.id}/invoices`);
  }

  if (!hasLoadedStoredQuote) {
    return (
      <div className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
        <p className="font-bold text-charcoal/70">Loading invoice...</p>
      </div>
    );
  }

  const linkedCustomerEmails = quote.customerId
    ? customers.find((c) => c.id === quote.customerId)?.emails.map((e) => e.email) ?? []
    : [];

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
                Invoice Details
              </p>
              <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
                Who is this invoice for?
              </h2>
            </div>

            <button
              type="button"
              onClick={resetInvoice}
              className="rounded-full border border-pine/20 bg-whitewarm px-5 py-3 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              Reset Invoice
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project Name (optional)">
              <input
                value={quote.projectName}
                onChange={(event) => updateQuote("projectName", event.target.value)}
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
                onChange={(event) => updateQuote("clientEmail", event.target.value)}
                placeholder="client@email.com"
                className="form-input"
                list={
                  linkedCustomerEmails.length > 0
                    ? "customer-email-options-direct"
                    : undefined
                }
              />
              {linkedCustomerEmails.length > 0 ? (
                <datalist id="customer-email-options-direct">
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
                onChange={(event) => updateQuote("clientPhone", event.target.value)}
                placeholder="Optional phone number"
                className="form-input"
              />
            </Field>

            <Field label="Address (optional)">
              <input
                value={quote.projectStreet}
                onChange={(event) => updateQuote("projectStreet", event.target.value)}
                placeholder="Street address"
                className="form-input"
              />
            </Field>

            <Field label="City / State / ZIP">
              <div className="flex gap-2">
                <input
                  value={quote.projectCity}
                  onChange={(event) => updateQuote("projectCity", event.target.value)}
                  placeholder="City"
                  className="form-input min-w-0 flex-1"
                />
                <input
                  value={quote.projectState}
                  onChange={(event) =>
                    updateQuote("projectState", event.target.value.toUpperCase())
                  }
                  maxLength={2}
                  placeholder="NC"
                  className="form-input w-16 shrink-0"
                />
                <input
                  inputMode="numeric"
                  value={quote.projectZip}
                  onChange={(event) => updateQuote("projectZip", event.target.value)}
                  placeholder="27021"
                  className="form-input w-24 shrink-0"
                />
              </div>
            </Field>
          </div>
        </section>

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <div className="mb-4">
            <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Line Items
            </p>
            <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
              Manual line items — change anything.
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-charcoal/75">
              Search the catalog to add a line (it prefills the description and
              the list price), or add a blank line and type anything. Every
              field stays editable: description, quantity, and unit price. The
              invoice amount is the sum of qty &times; unit price.
            </p>
          </div>

          <CatalogPicker
            items={availableItems}
            onPick={handleCatalogPick}
            label="Add from the pricing catalog"
            placeholder="Search the catalog to add a line..."
            emptyLabel="Every catalog item is already on the invoice — or add a blank line below."
          />

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
              Invoice lines
            </p>
            <button
              type="button"
              onClick={handleAddBlankLine}
              className="rounded-full border border-pine/20 bg-whitewarm px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              + Add blank line
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="mt-3 rounded-soft border border-pine/15 bg-cream px-4 py-8 text-center text-sm font-bold text-charcoal/60">
              No line items yet. Search the catalog above or click &quot;Add
              blank line&quot; to add the first one.
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {lines.map((line, index) => (
                <DirectInvoiceLineRow
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
            onChange={(event) => updateQuote("internalNotes", event.target.value)}
            placeholder="Optional notes for the owner only..."
            className="form-input min-h-32 resize-y py-3"
          />
        </section>

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
                Save invoice
              </p>
              <p className="font-bold text-charcoal/70">
                Saving creates the invoice immediately (no quote step): it gets
                a quote id, an INV number, and starts as unpaid. Email, pay
                link, and mark-paid all happen on the invoicing page.
              </p>
            </div>

            <button
              type="button"
              onClick={saveInvoice}
              disabled={isSaving}
              className="rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save & create invoice"}
            </button>
          </div>

          {saveMessage ? (
            <div
              className={`mt-5 rounded-soft border p-4 font-bold ${
                saveError
                  ? "border-clay/30 bg-clay/10 text-clay"
                  : "border-pine/15 bg-sage/20 text-deep-pine"
              }`}
            >
              {saveMessage}
            </div>
          ) : null}
        </section>
      </div>

      <aside className="rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-card lg:sticky lg:top-28">
        <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Invoice Amount
        </p>
        <p className="font-display text-5xl font-bold tracking-[-0.04em] text-deep-pine">
          {formatCurrency(amountCents)}
        </p>
        <p className="mt-2 text-sm font-bold text-charcoal/60">
          {lines.length} line{lines.length === 1 ? "" : "s"} &middot; one
          invoice, due on completion
        </p>

        <div className="mt-6 space-y-2 border-t border-pine/10 pt-4 text-sm">
          {lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate font-bold text-charcoal/70">
                {line.name || "Untitled line"}
              </span>
              <span className="font-black text-deep-pine">
                {formatCurrency(Math.round(line.quantity * (line.unitPriceCents ?? 0)))}
              </span>
            </div>
          ))}
          {lines.length === 0 ? (
            <p className="font-bold text-charcoal/50">No lines yet.</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

// --- Edit mode -------------------------------------------------------------

function DirectInvoiceEdit({
  quoteId,
  initialInvoiceData
}: {
  quoteId: string;
  initialInvoiceData: InvoiceData | null;
}) {
  const router = useRouter();
  const existing = initialInvoiceData;

  // Lines seeded from the invoice's own serviceLines (the living copy).
  const [lines, setLines] = useState<ServiceLine[]>(() =>
    (initialInvoiceData?.serviceLines ?? []).map((line) => ({ ...line }))
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState(false);

  const amountCents = useMemo(
    () => lines.reduce((sum, line) => sum + line.amountCents, 0),
    [lines]
  );

  const existingService: InvoiceRecord | null =
    existing?.invoices.find((invoice) => invoice.kind === "service") ?? null;

  // A paid invoice records money that was actually collected. If the current
  // lines would give it a different amount, saving resets it to unpaid (with
  // a warning) so the owner re-marks it paid at the new amount — never a
  // silent change to a collected amount.
  const paidAmountChanges = useMemo(() => {
    if (!existingService || existingService.status !== "paid") return [];
    return existingService.amountCents !== amountCents
      ? [
          {
            fromCents: existingService.amountCents,
            toCents: amountCents
          }
        ]
      : [];
  }, [existingService, amountCents]);

  useEffect(() => {
    setSaveMessage("");
    setSaveError(false);
  }, [lines]);

  function handleAddLine() {
    setSaveMessage("");
    setSaveError(false);
    // New lines insert AT THE TOP so the fresh row is visible without
    // scrolling.
    setLines((prev) => [
      {
        id: newLineId(),
        name: "",
        quantity: 1,
        amountCents: 0,
        unitPriceCents: 0,
        comment: ""
      },
      ...prev
    ]);
  }

  function handleUpdateLine(id: string, patch: Partial<ServiceLine>) {
    setSaveMessage("");
    setSaveError(false);
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        return {
          ...next,
          // The amount is always derived from qty x unit price so the two can
          // never disagree (mirrors the service-quote builder).
          amountCents: Math.round(next.quantity * (next.unitPriceCents ?? 0))
        };
      })
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
    const cleanedLines = lines
      .filter((line) => line.name.trim().length > 0)
      .map((line) => cleanLine(line));
    const contractCents = cleanedLines.reduce(
      (sum, line) => sum + line.amountCents,
      0
    );

    // Preserve the invoice number + paid status/timestamps. A paid invoice
    // whose amount changed resets to unpaid (warned above) so it is
    // re-marked paid at the new amount; the number never changes. A record
    // with no number (only possible after Delete invoices wiped the setup)
    // gets a fresh one reserved here.
    const prev = existingService;
    let invoiceNumber = prev?.invoiceNumber;
    if (!invoiceNumber) {
      try {
        invoiceNumber = await nextInvoiceNumber();
      } catch (err) {
        setIsSaving(false);
        setSaveError(true);
        setSaveMessage(
          err instanceof Error ? err.message : "Could not assign an invoice number."
        );
        return;
      }
    }
    const invoiceRecord: InvoiceRecord = prev
      ? prev.status === "paid" && prev.amountCents !== contractCents
        ? {
            kind: "service",
            amountCents: contractCents,
            status: "unpaid",
            issuedAt: prev.issuedAt ?? now,
            paidAt: null,
            invoiceNumber
          }
        : {
            kind: "service",
            amountCents: contractCents,
            status: prev.status,
            issuedAt: prev.issuedAt ?? now,
            paidAt: prev.paidAt ?? null,
            invoiceNumber
          }
      : {
          kind: "service",
          amountCents: contractCents,
          status: "unpaid",
          issuedAt: now,
          paidAt: null,
          invoiceNumber
        };

    const data: InvoiceData = {
      quoteType: "direct_invoice",
      contractAmountCents: contractCents,
      roughInPercent: 0,
      finishPercent: 0,
      permitFeeCents: 0,
      generatedAt: now,
      invoices: [invoiceRecord],
      serviceLines: cleanedLines
    };

    // Keep the quote-side mirrors in step so the customers money summary and
    // the P&L read the final contract (the invoice lines are the source of
    // truth; the quote-side snapshot mirrors them at each save).
    const calculationData = {
      clientQuoteTotalCents: contractCents,
      lines: cleanedLines
    };

    const { error } = await supabase
      .from("quotes")
      .update({
        invoice_data: data,
        calculation_data: calculationData,
        client_quote_total_cents: contractCents,
        updated_at: now
      })
      .eq("id", quoteId);

    setIsSaving(false);

    if (error) {
      setSaveError(true);
      setSaveMessage(`Save failed: ${error.message}`);
      return;
    }

    setSaveError(false);
    if (paidAmountChanges.length > 0) {
      setSaveMessage(
        `Invoice saved. The paid invoice whose amount changed was reset to unpaid so you can re-mark it paid at the new amount (was ${formatCurrency(
          paidAmountChanges[0].fromCents
        )}, now ${formatCurrency(paidAmountChanges[0].toCents)}).`
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
          Manual line items — change anything.
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          The invoice amount is the sum of qty &times; unit price below. Search
          the catalog to add a line, or add a blank line and type anything.
          Every field stays editable.
        </p>
      </div>

      <DirectInvoiceLineEditor
        lines={lines}
        onUpdate={handleUpdateLine}
        onRemove={handleRemoveLine}
        onAddBlankLine={handleAddLine}
      />

      <div className="mt-5 rounded-xl1 border border-pine/10 bg-cream p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-clay">
          Invoice amount (before saving)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-soft border border-pine/10 bg-whitewarm p-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
              Invoice
            </p>
            <p className="font-display text-xl font-bold text-deep-pine">
              {formatCurrency(amountCents)}
            </p>
            <p className="text-xs font-bold text-charcoal/55">
              sum of qty &times; unit price
            </p>
          </div>
          <div className="rounded-soft border border-pine/10 bg-whitewarm p-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
              Lines
            </p>
            <p className="font-display text-lg font-bold text-deep-pine">
              {lines.length}
            </p>
            <p className="text-xs font-bold text-charcoal/55">
              {lines.length === 1 ? "1 line" : `${lines.length} lines`}
            </p>
          </div>
        </div>
      </div>

      {paidAmountChanges.length > 0 ? (
        <div className="mt-5 rounded-soft border border-clay/30 bg-clay/10 p-4 text-sm font-bold leading-6 text-clay">
          Heads up: your changes would change the amount of the paid invoice
          (paid at {formatCurrency(paidAmountChanges[0].fromCents)}, would
          become {formatCurrency(paidAmountChanges[0].toCents)}). Saving resets
          it to unpaid so you can re-mark it paid at the new amount — a paid
          invoice records money already collected, so its amount is never
          changed silently.
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-charcoal/65">
          Saving updates the line items and invoice amount, and keeps any paid
          status.
        </p>
        <button
          type="button"
          onClick={saveInvoice}
          disabled={isSaving}
          className="rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Changes"}
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

// Shared line list + row editor (create + edit).

function DirectInvoiceLineEditor({
  lines,
  onUpdate,
  onRemove,
  onAddBlankLine
}: {
  lines: ServiceLine[];
  onUpdate: (id: string, patch: Partial<ServiceLine>) => void;
  onRemove: (id: string) => void;
  onAddBlankLine: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
          Line Items
        </p>
        <button
          type="button"
          onClick={onAddBlankLine}
          className="rounded-full border border-pine/20 bg-whitewarm px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          + Add blank line
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="mt-3 rounded-soft border border-pine/15 bg-cream px-4 py-8 text-center text-sm font-bold text-charcoal/60">
          No line items. Click &quot;Add blank line&quot; to add one.
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {lines.map((line, index) => (
            <DirectInvoiceLineRow
              key={line.id}
              index={index}
              line={line}
              onUpdate={(patch) => onUpdate(line.id, patch)}
              onRemove={() => onRemove(line.id)}
              canRemove={lines.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DirectInvoiceLineRow({
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
  const amountCents = Math.round(line.quantity * (line.unitPriceCents ?? 0));

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

      <div className="grid gap-3 md:grid-cols-[1fr_90px_140px_140px]">
        <label className="grid min-w-0 gap-1">
          <span className="text-xs font-black text-deep-pine">Description</span>
          <input
            type="text"
            value={line.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g. EV charger install"
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
          <span className="text-xs font-black text-deep-pine">Unit price ($)</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-charcoal/55">$</span>
            <FormattedNumberInput
              value={centsToDollars(line.unitPriceCents ?? 0)}
              onChange={(dollars) => {
                const unitPriceCents = dollarsToCents(dollars);
                onUpdate({ unitPriceCents, amountCents: Math.round(line.quantity * unitPriceCents) });
              }}
              allowDecimal
              min={0}
              placeholder="0.00"
              className="form-input"
            />
          </div>
        </label>

        <div className="grid min-w-0 gap-1">
          <span className="text-xs font-black text-deep-pine">Amount</span>
          <div className="flex h-12 items-center rounded-soft border border-pine/10 bg-sand/50 px-3">
            <span className="truncate font-black text-deep-pine">
              {formatCurrency(amountCents)}
            </span>
          </div>
        </div>
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

// Trim + normalize a line for saving. The amount is always derived from
// qty x unit price so the two can never disagree.
function cleanLine(line: ServiceLine): ServiceLine {
  const unitPriceCents = Math.max(0, Math.round(line.unitPriceCents ?? 0));
  const quantity = Math.max(0, line.quantity);
  return {
    id: line.id,
    name: line.name.trim(),
    quantity,
    unitPriceCents,
    amountCents: Math.round(quantity * unitPriceCents),
    comment: line.comment?.trim() || undefined
  };
}

function directInvoiceTotal(quote: QuoteFormState): number {
  return quote.serviceLines.reduce((sum, line) => sum + line.amountCents, 0);
}

// Labeled form-field wrapper for the create-mode customer/project fields
// (same pattern as the other builders).
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