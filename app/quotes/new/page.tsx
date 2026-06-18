import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function NewQuotePage() {
  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href="/"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to dashboard
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          New Quote
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Generate a new quote.
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          This is where the quote builder will go next. The first working
          version will include project details, base pricing, adders, pricing
          level, contingency, and live quote totals.
        </p>
      </div>

      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 shadow-soft">
        <p className="text-lg font-black text-deep-pine">
          Quote builder coming in the next file batch.
        </p>
      </section>
    </AppShell>
  );
}
