"use client";

import Link from "next/link";

export function PrintQuoteButton({ quoteId }: { quoteId: string }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link
        href={`/quotes/${quoteId}`}
        className="rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
      >
        Back to quote
      </Link>

      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-full bg-pine px-6 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}