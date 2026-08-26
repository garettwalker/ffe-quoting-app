import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { QuoteBuilder } from "@/components/quote-builder";
import { ServiceQuoteBuilder } from "@/components/service-quote-builder";
import { getCustomers } from "@/lib/customers";
import { getPricingCatalog } from "@/lib/pricing";
import { getSupabaseServer } from "@/lib/supabase-server";
import { normalizeQuoteType, normalizeStatus } from "@/lib/types";
import type { InvoiceData, QuoteFormState } from "@/lib/types";

type SavedQuoteRow = {
  id: string;
  status: string;
  quote_type: string | null;
  customer_id: string | null;
  quote_data: QuoteFormState;
  invoice_data: InvoiceData | null;
};

type PageProps = {
  params: { id: string };
};

// Always read the live pricing catalog from Supabase (no caching), so a price
// change made in /pricing-admin is reflected immediately when editing a quote.
export const dynamic = "force-dynamic";

export default async function EditSavedQuotePage({ params }: PageProps) {
  const supabase = getSupabaseServer();
  const [quoteResult, catalog, customers, paymentsRes] = await Promise.all([
    // status + invoice_data are read only to decide whether to show the
    // "this is accepted/invoiced" warning banner (see below). They are not
    // passed into QuoteBuilder.
    supabase
      .from("quotes")
      .select("id, status, quote_type, customer_id, quote_data, invoice_data")
      .eq("id", params.id)
      .single(),
    getPricingCatalog(),
    getCustomers(),
    // Any payment ledger row means real money is tied to this job. Counted
    // head-only so we never load payment details into the edit page.
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", params.id)
  ]);

  const { data, error } = quoteResult;

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
            href="/quotes"
            className="mt-6 inline-flex rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine"
          >
            Back to Quotes
          </Link>
        </section>
      </AppShell>
    );
  }

  const row = data as SavedQuoteRow;
  const quote = row.quote_data;
  // Prefer the customer_id column (source of truth, set by backfill) over the
  // JSONB snapshot so a backfilled quote opens with its customer link intact
  // even before it is re-saved. The picker treats the name as identity, so an
  // unchanged name keeps the link; editing the name away unlinks.
  if (!quote.customerId && row.customer_id) {
    quote.customerId = row.customer_id;
  }
  const status = normalizeStatus(row.status);
  const quoteType = normalizeQuoteType(row.quote_type);
  const isService = quoteType === "service_call";
  const paymentCount = paymentsRes.count ?? 0;
  const hasInvoices = !!row.invoice_data;

  // The edit page is only linked from draft / prepared quotes, but the URL
  // works on any quote. Saving here forces status back to "draft" and
  // overwrites quote_data / calculation_data, while invoice_data and payments
  // stay on the row — so an accepted or paid job would silently look like a
  // draft on the dashboard while the money is still recorded. Warn loudly when
  // the quote is past the safe-to-edit stage so this only happens on purpose.
  // "scheduled" is a service-call stage past accepted; treat it the same.
  const showProtectedBanner =
    status === "accepted" ||
    status === "scheduled" ||
    hasInvoices ||
    paymentCount > 0;

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
          {quote.projectName || quote.clientName || "Unnamed Client"}
        </h1>

        {quote.projectName ? (
          <p className="mt-2 text-base font-bold leading-7 text-charcoal/65">
            {quote.clientName}
          </p>
        ) : null}

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Update the quote details, then complete and save to update the
          existing record.
        </p>
      </div>

      {showProtectedBanner ? (
        <section className="mb-6 rounded-xl2 border border-clay/30 bg-clay/10 p-5 shadow-soft">
          <p className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-clay">
            This quote is accepted or has invoices / payments
          </p>
          <p className="text-sm font-bold leading-6 text-charcoal/80">
            Saving here reopens the quote as a draft and overwrites the saved
            quote. Any invoices and payments stay on the record, so the
            dashboard will then show it as a draft while that money is still
            collected. If you only meant a small change, go back. To edit
            deliberately, continue and use Save as draft.
          </p>
        </section>
      ) : null}

      {isService ? (
        <ServiceQuoteBuilder
          initialQuote={quote}
          savedQuoteId={row.id}
          customers={customers}
          projectTypes={catalog.projectTypes}
          defaultQuoteNotes={catalog.settings.defaultQuoteNotes}
        />
      ) : (
        <QuoteBuilder
          initialQuote={quote}
          savedQuoteId={row.id}
          catalog={catalog}
          customers={customers}
        />
      )}
    </AppShell>
  );
}