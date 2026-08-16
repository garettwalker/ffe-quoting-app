import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CustomerEditor } from "@/components/customer-editor";
import { formatCurrency, formatDate } from "@/lib/currency";
import { getCustomer, getCustomerQuotes } from "@/lib/customers";

// Customer detail: the record's fields + an inline editor (name / emails /
// phone / note) and the customer's quotes. Editing the record updates future
// quotes' autofill only; existing quotes keep their own client_name /
// client_email snapshot. v1 is edit-only (no delete / deactivate / merge).

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function CustomerDetailPage({ params }: PageProps) {
  const [customer, quotes] = await Promise.all([
    getCustomer(params.id),
    getCustomerQuotes(params.id)
  ]);

  if (!customer) {
    notFound();
  }

  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href="/customers"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to customers
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Customer
        </p>
        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          {customer.name}
        </h1>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm font-bold text-charcoal/65">
          {customer.emails.length > 0 ? (
            <span>
              {customer.emails.map((e) => e.email).join(", ")}
            </span>
          ) : (
            <span>No email on file</span>
          )}
          {customer.phone ? <span>{customer.phone}</span> : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <CustomerEditor customer={customer} />

        <aside className="rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-soft lg:sticky lg:top-28">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Quotes
          </p>

          {quotes.length === 0 ? (
            <p className="text-sm font-bold text-charcoal/55">
              No quotes linked to this customer yet.
            </p>
          ) : (
            <div className="space-y-2">
              {quotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="block rounded-soft border border-pine/10 bg-cream p-3 transition-colors hover:bg-sand"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-deep-pine">
                        {quote.projectName || quote.clientName || "Untitled"}
                      </p>
                      <p className="text-xs font-bold text-charcoal/55">
                        {quote.quoteId} &middot; {formatDate(quote.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-black text-deep-pine">
                        {formatCurrency(quote.clientQuoteTotalCents)}
                      </p>
                      <span className="mt-1 inline-block rounded-full bg-pine/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-deep-pine">
                        {quote.status}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>

      {customer.note ? (
        <section className="mt-8 rounded-xl2 border border-clay/25 bg-cream/60 p-6 shadow-soft">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Note
          </p>
          <p className="whitespace-pre-wrap font-bold leading-7 text-charcoal/80">
            {customer.note}
          </p>
        </section>
      ) : null}
    </AppShell>
  );
}