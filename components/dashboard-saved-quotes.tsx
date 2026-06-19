"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/lib/supabase";

type SavedQuoteRow = {
  id: string;
  quote_id: string;
  quote_date: string;
  client_name: string;
  project_street: string;
  project_city: string;
  project_state: string;
  project_zip: string;
  project_type: string;
  client_quote_total_cents: number;
  status: string;
  created_at: string;
};

type LoadStatus = "loading" | "loaded" | "error";

export function DashboardSavedQuotes() {
  const [quotes, setQuotes] = useState<SavedQuoteRow[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const loadQuotes = useCallback(async () => {
    setLoadStatus("loading");
    setErrorMessage("");

    const { data, error } = await supabase
      .from("quotes")
      .select(
        "id, quote_id, quote_date, client_name, project_street, project_city, project_state, project_zip, project_type, client_quote_total_cents, status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      setErrorMessage(error.message);
      setLoadStatus("error");
      return;
    }

    setQuotes((data as SavedQuoteRow[]) ?? []);
    setLoadStatus("loaded");
  }, []);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  return (
    <section className="mb-8 rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft md:p-8">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Saved Quotes
          </p>
          <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
            Recent quote history
          </h2>
        </div>

        <button
          type="button"
          onClick={loadQuotes}
          disabled={loadStatus === "loading"}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine transition hover:bg-pine hover:text-whitewarm disabled:cursor-wait disabled:opacity-60"
        >
          {loadStatus === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      {loadStatus === "loading" ? <LoadingState /> : null}
      {loadStatus === "error" ? (
        <ErrorState message={errorMessage} onRetry={loadQuotes} />
      ) : null}
      {loadStatus === "loaded" && quotes.length === 0 ? <EmptyState /> : null}
      {loadStatus === "loaded" && quotes.length > 0 ? (
        <QuotesTable quotes={quotes} />
      ) : null}
    </section>
  );
}

function QuotesTable({ quotes }: { quotes: SavedQuoteRow[] }) {
  return (
    <div className="responsive-table-wrap rounded-xl1 border border-pine/10">
      <table className="responsive-table w-full border-collapse text-left text-sm">
        <thead className="bg-sand text-deep-pine">
          <tr>
            <th className="p-3 font-black">Quote ID</th>
            <th className="p-3 font-black">Client</th>
            <th className="p-3 font-black">Project Address</th>
            <th className="p-3 font-black">Type</th>
            <th className="p-3 font-black">Total</th>
            <th className="p-3 font-black">Status</th>
            <th className="p-3 font-black">Created</th>
            <th className="p-3 font-black">{""}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-pine/10 bg-cream">
          {quotes.map((quote) => (
            <tr key={quote.id}>
              <td className="p-3 font-black text-deep-pine">{quote.quote_id}</td>
              <td className="p-3 font-bold text-charcoal">
                {quote.client_name}
              </td>
              <td className="p-3 text-charcoal/80">
                {formatAddress(quote)}
              </td>
              <td className="p-3 text-charcoal/80">{quote.project_type}</td>
              <td className="p-3 font-black text-deep-pine">
                {formatCurrency(quote.client_quote_total_cents)}
              </td>
              <td className="p-3">
                <StatusBadge status={quote.status} />
              </td>
              <td className="p-3 text-charcoal/70">
                {formatDate(quote.created_at)}
              </td>
              <td className="p-3">
                <Link
                  href={`/quotes/${quote.id}`}
                  className="inline-flex items-center justify-center rounded-full bg-pine px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-whitewarm shadow-card transition hover:bg-deep-pine"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-xl1 border border-pine/10 bg-cream p-6 text-center font-bold text-charcoal/60">
      Loading saved quotes...
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl1 border border-pine/10 bg-cream p-8 text-center">
      <p className="mb-2 font-display text-xl font-bold text-moss">
        No saved quotes yet
      </p>
      <p className="mx-auto mb-5 max-w-md text-sm leading-6 text-charcoal/70">
        Completed quotes will appear here after you save them from the review
        page.
      </p>
      <Link
        href="/quotes/new"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card transition hover:-translate-y-0.5 hover:bg-deep-pine"
      >
        Start New Quote
      </Link>
    </div>
  );
}

function ErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl1 border border-clay/25 bg-cream p-6">
      <p className="mb-1 font-black text-clay">Could not load saved quotes.</p>
      <p className="mb-4 break-words text-sm font-bold text-charcoal/70">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine transition hover:bg-pine hover:text-whitewarm"
      >
        Try Again
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-sage/30 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-deep-pine">
      {status}
    </span>
  );
}

function formatAddress(quote: SavedQuoteRow): string {
  return [
    quote.project_street,
    quote.project_city,
    quote.project_state,
    quote.project_zip
  ]
    .filter(Boolean)
    .join(", ");
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}