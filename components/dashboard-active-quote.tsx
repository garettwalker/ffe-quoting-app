"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getActiveQuote,
  clearActiveQuote,
  type StoredQuote
} from "@/lib/quote-storage";

// Slim one-line card. Shows only when there is an unsaved working copy in the
// browser (a draft that has not been written to Supabase yet). Once a quote is
// saved to Supabase, the dashboard works from the saved row instead, so this
// card hides itself when savedQuoteId is set.
export function DashboardResumeActiveQuote() {
  const router = useRouter();
  const [storedQuote, setStoredQuote] = useState<StoredQuote | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setStoredQuote(getActiveQuote());
    setHasLoaded(true);
  }, []);

  if (!hasLoaded) return null;

  // No working copy, or it is already tied to a saved Supabase row.
  if (!storedQuote || storedQuote.savedQuoteId) return null;

  const clientName = storedQuote.quote.clientName || "Unnamed client";

  function handleDiscard() {
    clearActiveQuote();
    setStoredQuote(null);
    router.refresh();
  }

  return (
    <section className="mb-8 rounded-xl2 border border-pine/10 bg-whitewarm/80 p-5 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Unsaved working copy
          </p>
          <p className="font-bold text-charcoal">
            Resume unsaved quote for{" "}
            <span className="text-deep-pine">{clientName}</span>
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link
            href="/quotes/new"
            className="rounded-full bg-pine px-5 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
          >
            Resume
          </Link>
          <button
            type="button"
            onClick={handleDiscard}
            className="rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
          >
            Discard
          </button>
        </div>
      </div>
    </section>
  );
}