import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatCurrency } from "@/lib/currency";
import { getCustomers, getCustomerMoney } from "@/lib/customers";

// Customer repository. Every quote's Builder / Customer is backed by a
// customer record here (backfilled from existing quotes, and created on the
// fly from the quote builder). One row per customer with their linked-quote
// count and Quoted / Invoiced / Paid totals (Invoiced/Paid use the same
// receivable model as /receivables, so the figures tie out). Click through to
// edit the record and see the customer's jobs. Read-only list (writes happen
// on the detail page).

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [customers, money] = await Promise.all([
    getCustomers(),
    getCustomerMoney()
  ]);
  const stats = money.byCustomer;

  // Page-level grand totals across every customer (sum of the per-customer
  // figures), so the whole book can be scanned at a glance.
  const grandTotals = Array.from(stats.values()).reduce(
    (acc, s) => ({
      quotedCents: acc.quotedCents + s.quotedCents,
      invoicedCents: acc.invoicedCents + s.invoicedCents,
      paidCents: acc.paidCents + s.paidCents
    }),
    { quotedCents: 0, invoicedCents: 0, paidCents: 0 }
  );

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
          Click a customer to edit their details or see their jobs.
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
        <>
          {money.capped ? (
            <p className="mb-6 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
              This view reached its cap, so some older quotes may not be counted
              in these totals. Raise the cap in lib/customers.ts to fix the count.
            </p>
          ) : null}

          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Total Quoted"
              value={formatCurrency(grandTotals.quotedCents)}
            />
            <SummaryCard
              label="Total Invoiced"
              value={formatCurrency(grandTotals.invoicedCents)}
            />
            <SummaryCard
              label="Total Paid"
              value={formatCurrency(grandTotals.paidCents)}
            />
          </div>

          <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
            <div className="overflow-hidden rounded-xl1 border border-pine/10">
              <div className="divide-y divide-pine/10">
                {customers.map((customer) => {
                  const s = stats.get(customer.id) ?? {
                    quoteCount: 0,
                    quotedCents: 0,
                    invoicedCents: 0,
                    paidCents: 0
                  };
                  const primary = customer.emails[0]?.email;
                  return (
                    <Link
                      key={customer.id}
                      href={`/customers/${customer.id}`}
                      className="flex flex-col gap-3 bg-cream p-4 transition-colors hover:bg-sand lg:flex-row lg:items-center lg:justify-between"
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
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:text-right">
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
                            Quoted
                          </p>
                          <p className="font-black text-deep-pine">
                            {formatCurrency(s.quotedCents)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                            Invoiced
                          </p>
                          <p className="font-black text-deep-pine">
                            {formatCurrency(s.invoicedCents)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-clay">
                            Paid
                          </p>
                          <p className="font-black text-deep-pine">
                            {formatCurrency(s.paidCents)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function SummaryCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-5 shadow-soft">
      <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
        {label}
      </p>
      <p className="font-display text-3xl font-bold text-deep-pine">{value}</p>
    </div>
  );
}