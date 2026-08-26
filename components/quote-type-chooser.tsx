"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearActiveQuote, getActiveQuote } from "@/lib/quote-storage";
import type { StoredQuote } from "@/lib/quote-storage";

// First screen of "New quote": pick New Build or Service Call. Both cards go to
// the same /quotes/new page with a ?type= search param that selects the builder.
//
// If a browser draft already exists in localStorage, a "Resume your <type>
// quote" card appears above the two "Start new" cards. "Start new" clears the
// draft first so it does not silently clobber an in-progress quote of the other
// type (the owner might have a new-build draft open and choose Service Call —
// clearing prevents the service builder from loading the new-build draft, and
// prevents the new-build draft from being lost without warning).

export function QuoteTypeChooser() {
  const router = useRouter();
  const [stored, setStored] = useState<StoredQuote | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setStored(getActiveQuote());
    setHasLoaded(true);
  }, []);

  function startNew(type: "new_build" | "service_call") {
    clearActiveQuote();
    router.push(`/quotes/new?type=${type}`);
  }

  const resumeType = stored?.quote.quoteType ?? "new_build";
  const resumeLabel =
    resumeType === "service_call" ? "Service call quote" : "New build quote";
  const resumeHref =
    resumeType === "service_call"
      ? "/quotes/new?type=service_call"
      : "/quotes/new?type=new_build";

  return (
    <div className="space-y-8">
      {hasLoaded && stored ? (
        <section className="rounded-xl2 border border-clay/25 bg-cream/70 p-6 shadow-card">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Resume in-progress quote
          </p>
          <p className="font-bold text-charcoal/80">
            You have a {resumeLabel.toLowerCase()} draft saved in this browser.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={resumeHref}
              className="rounded-full bg-pine px-6 py-3 text-center font-black text-whitewarm shadow-card hover:bg-deep-pine"
            >
              Resume {resumeLabel}
            </Link>
            <button
              type="button"
              onClick={() => clearActiveQuote()}
              className="rounded-full border border-pine/20 px-6 py-3 font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              Discard draft
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <button
          type="button"
          onClick={() => startNew("new_build")}
          className="group flex min-h-64 flex-col rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 text-left shadow-card transition hover:border-pine/30 hover:bg-whitewarm"
        >
          <p className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-clay">
            New Build
          </p>
          <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
            Full catalog quote
          </h2>
          <p className="mt-3 text-sm font-medium leading-6 text-charcoal/75">
            Per-square-foot base rate, pricing level, and contingency from the
            catalog. Add optional line items. Two invoices: rough-in and finish.
          </p>
          <span className="mt-auto pt-5 text-sm font-black text-deep-pine group-hover:underline">
            Start new build quote &rarr;
          </span>
        </button>

        <button
          type="button"
          onClick={() => startNew("service_call")}
          className="group flex min-h-64 flex-col rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 text-left shadow-card transition hover:border-pine/30 hover:bg-whitewarm"
        >
          <p className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Service Call / Other
          </p>
          <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-moss">
            Freeform quote
          </h2>
          <p className="mt-3 text-sm font-medium leading-6 text-charcoal/75">
            Manual line items: description, quantity, and a row amount. No pricing
            levers. A single invoice due on completion, payable online by card or
            ACH.
          </p>
          <span className="mt-auto pt-5 text-sm font-black text-deep-pine group-hover:underline">
            Start service call quote &rarr;
          </span>
        </button>
      </div>
    </div>
  );
}