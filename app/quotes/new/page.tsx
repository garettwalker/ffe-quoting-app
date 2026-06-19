import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { QuoteBuilder } from "@/components/quote-builder";
import { getPricingCatalog } from "@/lib/pricing";

// Always read the live pricing catalog from Supabase (no caching), so a price
// change made in /pricing-admin is reflected immediately when starting a quote.
export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const catalog = await getPricingCatalog();

  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href="/quotes"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to quotes
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          New Quote
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Generate a new quote.
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Enter the project details, choose the pricing setup, add optional line
          items, and review the live quote total.
        </p>
      </div>

      <QuoteBuilder catalog={catalog} />
    </AppShell>
  );
}