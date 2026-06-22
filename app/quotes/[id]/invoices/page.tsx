import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InvoiceBuilder } from "@/components/invoice-builder";
import { InvoicePaidButton } from "@/components/invoice-paid-button";
import { InvoicePaidBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/currency";
import { invoiceReference, outstandingCents, isPaidInFull } from "@/lib/invoice-calculations";
import { supabase } from "@/lib/supabase";
import type {
  InvoiceData,
  InvoiceKind,
  QuoteCalculationResult,
  QuoteFormState
} from "@/lib/types";

// Always read the live quote row + invoice data from Supabase (no caching).
export const dynamic = "force-dynamic";

type InvoicePageRow = {
  id: string;
  quote_id: string;
  status: string;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult;
  invoice_data: InvoiceData | null;
};

type PageProps = {
  params: { id: string };
};

export default async function InvoicingPage({ params }: PageProps) {
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, status, quote_data, calculation_data, invoice_data"
    )
    .eq("id", params.id)
    .single();

  if (error || !data || !data.quote_data || !data.calculation_data) {
    notFound();
  }

  const row = data as InvoicePageRow;
  const quote = row.quote_data;
  const result = row.calculation_data;
  const invoiceData = row.invoice_data;

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const initialInvoice =
    invoiceData?.invoices.find((invoice) => invoice.kind === "initial") ?? null;
  const finishInvoice =
    invoiceData?.invoices.find((invoice) => invoice.kind === "finish") ?? null;

  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href={`/quotes/${row.id}`}
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to quote
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Invoicing
        </p>
        <h1 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
          {quote.clientName || "Unnamed Client"}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-charcoal/70">
          {fullAddress || "No project address entered"}
        </p>

        {invoiceData ? (
          <p className="mt-4 inline-flex rounded-full bg-cream px-4 py-2 text-sm font-black text-deep-pine">
            {isPaidInFull(invoiceData)
              ? "Paid in full"
              : `Outstanding: ${formatCurrency(outstandingCents(invoiceData))}`}
          </p>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <InvoiceBuilder
            quoteId={row.id}
            initialInvoiceData={invoiceData}
            quoteTotalCents={result.clientQuoteTotalCents}
          />

          {invoiceData ? (
            <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
              <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
                Invoices
              </p>

              <div className="grid gap-4">
                {initialInvoice ? (
                  <InvoiceCard
                    quoteId={row.id}
                    invoiceData={invoiceData}
                    kind="initial"
                    reference={invoiceReference(row.quote_id, "initial")}
                    title="Invoice 1: Rough-In (Initial)"
                    amountCents={initialInvoice.amountCents}
                    status={initialInvoice.status}
                  />
                ) : null}

                {finishInvoice ? (
                  <InvoiceCard
                    quoteId={row.id}
                    invoiceData={invoiceData}
                    kind="finish"
                    reference={invoiceReference(row.quote_id, "finish")}
                    title="Invoice 2: Finish"
                    amountCents={finishInvoice.amountCents}
                    status={finishInvoice.status}
                  />
                ) : null}
              </div>
            </section>
          ) : (
            <section className="rounded-xl2 border border-pine/10 bg-cream p-6 text-sm font-bold text-charcoal/70">
              No invoices yet. Set up the contract amount, split, and permit fee
              above, then click Save Invoices.
            </section>
          )}
        </div>

        <aside className="rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-soft lg:sticky lg:top-28">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Quote Reference
          </p>
          <p className="font-black text-deep-pine">{row.quote_id}</p>
          <p className="mt-1 text-sm font-bold text-charcoal/70">
            Quote total: {formatCurrency(result.clientQuoteTotalCents)}
          </p>

          <div className="mt-5 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/75">
            The initial invoice is the rough-in amount plus the permit fee. The
            finish invoice is the remainder of the contract. Mark each invoice
            paid as it is collected.
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function InvoiceCard({
  quoteId,
  invoiceData,
  kind,
  reference,
  title,
  amountCents,
  status
}: {
  quoteId: string;
  invoiceData: InvoiceData;
  kind: InvoiceKind;
  reference: string;
  title: string;
  amountCents: number;
  status: "unpaid" | "paid";
}) {
  return (
    <div className="rounded-xl1 border border-pine/10 bg-cream p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-deep-pine">{reference}</span>
            <InvoicePaidBadge status={status} />
          </div>
          <p className="mt-1 font-bold text-charcoal">{title}</p>
        </div>
        <p className="font-display text-lg font-bold text-deep-pine md:text-right">
          {formatCurrency(amountCents)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/quotes/${quoteId}/invoices/${kind}/print`}
          className="rounded-full bg-pine px-4 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
        >
          PDF
        </Link>
        <InvoicePaidButton quoteId={quoteId} invoiceData={invoiceData} kind={kind} />
      </div>
    </div>
  );
}