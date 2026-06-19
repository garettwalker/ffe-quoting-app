import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { QuoteBuilder } from "@/components/quote-builder";
import { supabase } from "@/lib/supabase";
import type { QuoteFormState } from "@/lib/types";

type SavedQuoteRow = {
  id: string;
  quote_data: QuoteFormState;
};

type PageProps = {
  params: { id: string };
};

export default async function EditSavedQuotePage({ params }: PageProps) {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_data")
    .eq("id", params.id)
    .single();

  if (error || !data || !data.quote_data) {
    return (
      <AppShell>
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 shadow-soft">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Edit Saved Quote
          </p>
          <h1 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
            Quote not found.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            We could not load this quote to edit. It may have been removed, or
            the link may be incorrect.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine"
          >
            Back to Dashboard
          </Link>
        </section>
      </AppShell>
    );
  }

  const row = data as SavedQuoteRow;
  const quote = row.quote_data;

  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href={`/quotes/${row.id}`}
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to saved quote
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Edit Saved Quote
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          {quote.clientName || "Unnamed Client"}
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Update the quote details, then complete and save to update the
          existing record.
        </p>
      </div>

      <QuoteBuilder initialQuote={quote} savedQuoteId={row.id} />
    </AppShell>
  );
}