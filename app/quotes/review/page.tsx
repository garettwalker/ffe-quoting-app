"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { formatCurrency } from "@/lib/currency";
import { clearActiveQuote, getActiveQuote, type StoredQuote } from "@/lib/quote-storage";

export default function QuoteReviewPage() {
  const [storedQuote, setStoredQuote] = useState<StoredQuote | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setStoredQuote(getActiveQuote());
    setHasLoaded(true);
  }, []);

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

  const { quote, result } = storedQuote;

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Link
            href="/quotes/new"
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
            Review the quote details before we add permanent saving and PDF
            export.
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
            <ReviewField label="Quote ID" value={quote.quoteId} />
            <ReviewField label="Quote Date" value={quote.quoteDate} />
            <ReviewField label="Client" value={quote.clientName} />
            <ReviewField label="Client Email" value={quote.clientEmail || "Not entered"} />
            <ReviewField label="Project Address" value={fullAddress} />
            <ReviewField label="Project Type" value={quote.projectType} />
            <ReviewField
              label="Square Footage"
              value={quote.squareFootage.toLocaleString()}
            />
            <ReviewField label="Base Rate" value={formatCurrency(result.baseRateCents)} />
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
                      <td className="p-3 font-bold text-charcoal">{line.name}</td>
                      <td className="p-3">{line.quantity.toLocaleString()}</td>
                      <td className="p-3">{line.unitType}</td>
                      <td className="p-3">{formatCurrency(line.clientUnitPriceCents)}</td>
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
              href="/quotes/new"
              className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              Edit Quote
            </Link>

            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-full bg-pine/50 px-5 py-3 font-black text-whitewarm"
              title="Coming next"
            >
              Save Quote
            </button>

            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-full border border-pine/15 px-5 py-3 font-black text-deep-pine/45"
              title="Coming later"
            >
              Generate PDF
            </button>

            <button
              type="button"
              onClick={() => {
                clearActiveQuote();
                setStoredQuote(null);
              }}
              className="rounded-full border border-clay/25 px-5 py-3 font-black text-clay hover:bg-clay hover:text-whitewarm"
            >
              Clear Review Quote
            </button>
          </div>

          <div className="mt-6 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/70">
            This review page is currently using temporary browser storage. Next,
            we will make the dashboard show this quote as a recent completed
            quote.
          </div>
        </aside>
      </div>
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
