import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatCurrency } from "@/lib/currency";
import { getCustomers, getCustomerStatsMap } from "@/lib/customers";

// Customer repository. Every quote's Builder / Customer is backed by a
// customer record here (backfilled from existing quotes, and created on the
// fly from the quote builder). One row per customer with their linked-quote
// count and total quoted dollars. Click through to edit the record and see
// the customer's quotes. Read-only list (writes happen on the detail page).

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [customers, stats] = await Promise.all([
    getCustomers(),
    getCustomerStatsMap()
  ]);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Customers
        </p>
        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Customer repository
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Every quote's builder or customer lives here as a re-usable record.
          Click a customer to edit their details or see their quotes.
        </p>
      </div>

      {customers.length === 0 ? (
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 shadow-soft">
          <p className="font-bold text-charcoal/70">
            No customers yet. Start a new quote and type a builder or customer
            name to create one.
          </p>
        </section>
      ) : (
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
          <div className="overflow-hidden rounded-xl1 border border-pine/10">
            <div className="divide-y divide-pine/10">
              {customers.map((customer) => {
                const s = stats.get(customer.id) ?? {
                  quoteCount: 0,
                  totalQuotedCents: 0
                };
                const primary = customer.emails[0]?.email;
                return (
                  <Link
                    key={customer.id}
                    href={`/customers/${customer.id}`}
                    className="flex flex-col gap-2 bg-cream p-4 transition-colors hover:bg-sand sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-black text-deep-pine">{customer.name}</p>
                      <p className="text-sm font-bold text-charcoal/55">
                        {primary
                          ? customer.emails.length > 1
                            ? `${primary} +${customer.emails.length - 1} more`
                            : primary
                          : customer.phone
                            ? customer.phone
                            : "No email on file"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-6 sm:text-right">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                          Quotes
                        </p>
                        <p className="font-black text-deep-pine">
                          {s.quoteCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                          Total quoted
                        </p>
                        <p className="font-black text-deep-pine">
                          {formatCurrency(s.totalQuotedCents)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
}