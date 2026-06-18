"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { getActiveQuote, type StoredQuote } from "@/lib/quote-storage";

export function DashboardActiveQuote() {
  const [storedQuote, setStoredQuote] = useState<StoredQuote | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setStoredQuote(getActiveQuote());
    setHasLoaded(true);
  }, []);

  if (!hasLoaded || !storedQuote) {
    return null;
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
    <section className="mb-8 rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-soft">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Active Quote
          </p>
          <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
            {quote.clientName || "Unnamed Client"}
          </h2>
          <p className="mt-2 max-w-2xl font-bold leading-7 text-charcoal/70">
            {fullAddress || "No project address entered"}
          </p>
        </div>

        <div className="rounded-xl1 border border-pine/10 bg-cream px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-clay">
            Quote Total
          </p>
          <p className="font-display text-3xl font-bold tracking-[-0.035em] text-deep-pine">
            {formatCurrency(result.clientQuoteTotalCents)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <InfoTile label="Quote ID" value={quote.quoteId} />
        <InfoTile label="Project Type" value={quote.projectType} />
        <InfoTile
          label="Square Feet"
          value={quote.squareFootage.toLocaleString()}
        />
        <InfoTile
          label="Line Items"
          value={result.clientFacingLines.length.toString()}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/quotes/review"
          className="rounded-full bg-pine px-6 py-3 text-center font-black text-whitewarm shadow-card hover:bg-deep-pine"
        >
          Review Quote
        </Link>

        <Link
          href="/quotes/new"
          className="rounded-full border border-pine/20 px-6 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          Edit Quote
        </Link>
      </div>
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-soft border border-pine/10 bg-cream p-4">
      <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
        {label}
      </p>
      <p className="break-words font-black text-deep-pine">{value}</p>
    </div>
  );
}
