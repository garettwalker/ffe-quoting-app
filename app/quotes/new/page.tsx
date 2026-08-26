import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { QuoteBuilder } from "@/components/quote-builder";
import { ServiceQuoteBuilder } from "@/components/service-quote-builder";
import { QuoteTypeChooser } from "@/components/quote-type-chooser";
import { getCustomers } from "@/lib/customers";
import { getPricingCatalog } from "@/lib/pricing";
import type { QuoteType } from "@/lib/types";

// Always read the live pricing catalog + customers from Supabase (no caching),
// so a price change / new customer is reflected immediately when starting a
// quote. The catalog is only needed for new-build quotes; service calls only
// need the customer repository. We fetch both up front regardless so the
// dispatch is one server render with no waterfall.
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: { type?: string };
};

function parseQuoteType(value: string | undefined): QuoteType | null {
  if (value === "new_build" || value === "service_call") return value;
  return null;
}

export default async function NewQuotePage({ searchParams }: PageProps) {
  const type = parseQuoteType(searchParams.type);

  // No (or unrecognized) ?type= -> show the type chooser. This is the first
  // screen when the owner clicks "New quote": pick New Build or Service Call.
  if (!type) {
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
            What kind of quote?
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            Pick the quote type first. A new build uses the full pricing catalog
            (base rate, pricing level, contingency, two invoices). A service
            call is a simpler freeform quote with manual line items and a single
            invoice.
          </p>
        </div>

        <QuoteTypeChooser />
      </AppShell>
    );
  }

  const [catalog, customers] = await Promise.all([
    getPricingCatalog(),
    getCustomers()
  ]);

  if (type === "service_call") {
    return (
      <AppShell>
        <div className="mb-8">
          <Link
            href="/quotes/new"
            className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
          >
            Back to quote type
          </Link>

          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            New Quote / Service Call
          </p>

          <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
            Generate a service call quote.
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            Enter the customer and project details, add freeform line items,
            and review the quote total. One invoice, due on completion.
          </p>
        </div>

        <ServiceQuoteBuilder
          customers={customers}
          projectTypes={catalog.projectTypes}
          defaultQuoteNotes={catalog.settings.defaultQuoteNotes}
        />
      </AppShell>
    );
  }

  // new_build
  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href="/quotes/new"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to quote type
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          New Quote / New Build
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Generate a new build quote.
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Enter the project details, choose the pricing setup, add optional line
          items, and review the live quote total.
        </p>
      </div>

      <QuoteBuilder catalog={catalog} customers={customers} />
    </AppShell>
  );
}