"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { formatCurrency } from "@/lib/currency";
import {
  clearActiveQuote,
  getActiveQuote,
  type StoredQuote
} from "@/lib/quote-storage";
import { resolveQuoteIdForSave } from "@/lib/quote-id";
import { supabase } from "@/lib/supabase";

export default function QuoteReviewPage() {
  const router = useRouter();
  const [storedQuote, setStoredQuote] = useState<StoredQuote | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    setStoredQuote(getActiveQuote());
    setHasLoaded(true);
  }, []);

  async function saveQuoteToSupabase() {
    if (!storedQuote) return;

    setIsSaving(true);
    setSaveStatus("");

    const { quote, result, savedQuoteId } = storedQuote;

    // Resolve the quote id: keep a custom id the owner typed; otherwise, if we
    // are updating an existing saved quote, keep its existing id; otherwise ask
    // the server for the next atomic daily number. Done before the payload is
    // built so the assigned id is what gets persisted.
    let resolvedQuoteId: string;
    try {
      resolvedQuoteId = await resolveQuoteIdForSave(quote.quoteId, quote.quoteDate, savedQuoteId);
    } catch (err) {
      setSaveStatus(
        `Save failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setIsSaving(false);
      return;
    }

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
      status: "prepared",
      updated_at: new Date().toISOString()
    };

    if (savedQuoteId) {
      // Update the existing saved quote row.
      const { error } = await supabase
        .from("quotes")
        .update(payload)
        .eq("id", savedQuoteId);

      if (error) {
        setSaveStatus(`Update failed: ${error.message}`);
        setIsSaving(false);
        return;
      }

      clearActiveQuote();
      setStoredQuote({
        ...storedQuote,
        quote: { ...quote, quoteId: resolvedQuoteId }
      });
      setSaveStatus("Prepared. It appears under Prepared on the dashboard.");
      setHasSaved(true);
      setIsSaving(false);
      return;
    }

    // Insert a new saved quote and remember its id (in memory) so the View
    // and Edit links work. Then clear the browser working copy so the owner
    // works from the saved file going forward instead of the active quote.
    const { data, error } = await supabase
      .from("quotes")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setSaveStatus(`Save failed: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setStoredQuote({
      ...storedQuote,
      quote: { ...quote, quoteId: resolvedQuoteId },
      savedQuoteId: data.id
    });
    clearActiveQuote();
    setSaveStatus("Prepared. It appears under Prepared on the dashboard.");
    setHasSaved(true);
    setIsSaving(false);
  }

  if (!hasLoaded) {
    return (
      <AppShell>
        <p className="font-bold text-charcoal/70">Loading quote review...</p>
      </AppShell>
    );
  }

  if (!storedQuote) {
    return (
      <AppShell>
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 shadow-soft">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Quote Review
          </p>
          <h1 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
            No quote is ready for review.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            Start a new quote, complete the quote details, and then return here
            to review the customer-facing summary.
          </p>

          <Link
            href="/quotes/new"
            className="mt-6 inline-flex rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine"
          >
            Start New Quote
          </Link>
        </section>
      </AppShell>
    );
  }

  const { quote, result, savedQuoteId } = storedQuote;

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const saveButtonLabel = hasSaved
    ? "Prepared"
    : savedQuoteId
      ? "Prepare"
      : "Prepare";

  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Link
            href={savedQuoteId ? `/quotes/${savedQuoteId}/edit` : "/quotes/new"}
            className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
          >
            Back to quote builder
          </Link>

          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Quote Review
          </p>

          <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
            Review completed quote.
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            Review the quote details, prepare the quote, and then continue
            toward PDF export.
          </p>
        </div>

        <div className="rounded-xl1 border border-pine/10 bg-whitewarm/75 px-5 py-4 shadow-card">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-clay">
            Final Total
          </p>
          <p className="font-display text-4xl font-bold tracking-[-0.04em] text-deep-pine">
            {formatCurrency(result.clientQuoteTotalCents)}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Customer Quote Summary
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <ReviewField label="Quote ID" value={quote.quoteId || "Assigned on save"} />
            <ReviewField label="Quote Date" value={quote.quoteDate} />
            <ReviewField label="Client" value={quote.clientName} />
            <ReviewField
              label="Client Email"
              value={quote.clientEmail || "Not entered"}
            />
            <ReviewField label="Project Address" value={fullAddress} />
            <ReviewField label="Project Type" value={quote.projectType} />
            <ReviewField
              label="Square Footage"
              value={quote.squareFootage.toLocaleString()}
            />
            <ReviewField
              label="Base Rate"
              value={formatCurrency(result.baseRateCents)}
            />
          </div>

          <div className="mt-8">
            <p className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Customer-Facing Line Items
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-pine/10 bg-cream">
                  {result.clientFacingLines.map((line) => (
                    <tr key={line.pricingItemId}>
                      <td className="p-3 font-bold text-charcoal">
                        {line.name}
                      </td>
                      <td className="p-3">{line.quantity.toLocaleString()}</td>
                      <td className="p-3">{line.unitType}</td>
                      <td className="p-3">
                        {formatCurrency(line.clientUnitPriceCents)}
                      </td>
                      <td className="p-3 font-black text-deep-pine">
                        {formatCurrency(line.clientLineTotalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-soft lg:sticky lg:top-28">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Next Actions
          </p>

          <div className="grid gap-3">
            <Link
              href={savedQuoteId ? `/quotes/${savedQuoteId}/edit` : "/quotes/new"}
              className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              Edit Quote
            </Link>

            <button
              type="button"
              onClick={saveQuoteToSupabase}
              disabled={isSaving || hasSaved}
              className="rounded-full bg-pine px-5 py-3 font-black text-whitewarm hover:bg-deep-pine disabled:cursor-default disabled:bg-pine/50"
            >
              {isSaving ? "Preparing..." : saveButtonLabel}
            </button>

            {hasSaved && savedQuoteId ? (
              <Link
                href={`/quotes/${savedQuoteId}/print`}
                className="rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card hover:bg-deep-pine"
              >
                Detailed Quote PDF
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-full border border-pine/15 px-5 py-3 font-black text-deep-pine/45"
                title="Save the quote first to download"
              >
                Detailed Quote PDF
              </button>
            )}
          </div>

          {saveStatus ? (
            <div className="mt-5 rounded-soft border border-pine/15 bg-sage/20 p-4 font-bold text-deep-pine">
              {saveStatus}
              {hasSaved ? (
                <div className="mt-3 flex flex-col gap-2">
                  {savedQuoteId ? (
                    <Link
                      href={`/quotes/${savedQuoteId}`}
                      className="font-black text-clay underline decoration-clay/40 decoration-2 underline-offset-4"
                    >
                      View saved quote
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      clearActiveQuote();
                      router.push("/quotes/new");
                    }}
                    className="self-start font-black text-deep-pine underline decoration-pine/30 decoration-2 underline-offset-4"
                  >
                    Start a new quote
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      {quote.internalNotes.trim() ? (
        <section className="mt-8 rounded-xl2 border border-clay/25 bg-cream/60 p-6 shadow-soft">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Internal Notes (not shown to customer)
          </p>
          <p className="whitespace-pre-wrap font-bold leading-7 text-charcoal/80">
            {quote.internalNotes}
          </p>
        </section>
      ) : null}
    </AppShell>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-soft border border-pine/10 bg-cream p-4">
      <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
        {label}
      </p>
      <p className="break-words font-black text-deep-pine">{value}</p>
    </div>
  );
}