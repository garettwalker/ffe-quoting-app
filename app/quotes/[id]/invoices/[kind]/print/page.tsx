import Image from "next/image";
import Link from "next/link";
import { InvoicePrintButton } from "@/components/invoice-print-button";
import { formatCurrency } from "@/lib/currency";
import {
  computeInvoiceAmounts,
  invoiceReference
} from "@/lib/invoice-calculations";
import { businessInfo, invoicePaymentTerms } from "@/lib/seed-data";
import { supabase } from "@/lib/supabase";
import type {
  InvoiceData,
  InvoiceKind,
  QuoteCalculationResult,
  QuoteFormState
} from "@/lib/types";

type PrintRow = {
  id: string;
  quote_id: string;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult;
  invoice_data: InvoiceData | null;
};

type PageProps = {
  params: { id: string; kind: string };
};

export default async function PrintInvoicePage({ params }: PageProps) {
  const kind = params.kind;
  if (kind !== "initial" && kind !== "finish") {
    return <InvoiceNotFound />;
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_id, quote_data, calculation_data, invoice_data")
    .eq("id", params.id)
    .single();

  if (
    error ||
    !data ||
    !data.quote_data ||
    !data.calculation_data ||
    !data.invoice_data
  ) {
    return <InvoiceNotFound />;
  }

  const row = data as PrintRow;
  const quote = row.quote_data;
  const invoiceData = data.invoice_data as InvoiceData;
  const invoice = invoiceData.invoices.find((entry) => entry.kind === kind);

  if (!invoice) {
    return <InvoiceNotFound />;
  }

  const amounts = computeInvoiceAmounts(invoiceData);
  const reference = invoiceReference(row.quote_id, kind as InvoiceKind);
  const invoiceDate = formatInvoiceDate(invoice.issuedAt ?? invoiceData.generatedAt);

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const title = kind === "initial" ? "Initial Invoice" : "Finish Invoice";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <InvoicePrintButton quoteId={row.id} />

      <section className="print-document rounded-xl2 border border-pine/10 bg-whitewarm p-8 shadow-soft">
        <div className="flex flex-col gap-6 border-b border-pine/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/ffe-logo.png"
              alt="Freedom Family Electric logo"
              width={64}
              height={64}
              priority
              className="h-16 w-16 rounded-full object-contain"
            />
            <div>
              <p className="font-display text-2xl font-bold text-deep-pine">
                {businessInfo.name}
              </p>
              <p className="text-sm font-bold text-charcoal/70">
                {businessInfo.email}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="font-display text-3xl font-bold tracking-[-0.03em] text-moss">
              Invoice
            </p>
            <p className="mt-1 text-sm font-black text-deep-pine">{reference}</p>
            <p className="text-sm text-charcoal/70">{invoiceDate}</p>
          </div>
        </div>

        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
              Bill To
            </p>
            <p className="font-black text-deep-pine">{quote.clientName}</p>
            {quote.clientEmail ? (
              <p className="text-sm text-charcoal/70">{quote.clientEmail}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
              Project
            </p>
            <p className="font-bold text-charcoal">{fullAddress}</p>
            <p className="text-sm text-charcoal/70">
              {quote.projectType} · {quote.squareFootage.toLocaleString()} sq ft
            </p>
          </div>
        </div>

        <p className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-clay">
          {title}
        </p>

        <div className="overflow-hidden rounded-xl1 border border-pine/10">
          <div className="divide-y divide-pine/10 bg-cream">
            {kind === "initial" ? (
              <>
                <InvoiceLine
                  label={`Rough-In (${invoiceData.roughInPercent}% of contract)`}
                  amount={formatCurrency(amounts.roughInAmountCents)}
                />
                <InvoiceLine
                  label="Permit Fee"
                  amount={formatCurrency(invoiceData.permitFeeCents)}
                />
              </>
            ) : (
              <InvoiceLine
                label={`Finish (${invoiceData.finishPercent}% of contract)`}
                amount={formatCurrency(amounts.finishAmountCents)}
              />
            )}
          </div>
        </div>

        {kind === "finish" ? (
          <div className="mt-4 rounded-soft bg-sand/60 p-4 text-sm font-bold text-charcoal/75">
            <div className="flex items-center justify-between gap-4">
              <span>Previously invoiced (Rough-In + Permit)</span>
              <span>{formatCurrency(amounts.initialInvoiceAmountCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <span>Contract total</span>
              <span>{formatCurrency(invoiceData.contractAmountCents)}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs rounded-xl1 border border-pine/15 bg-cream px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black uppercase tracking-[0.12em] text-clay">
                Amount Due
              </p>
              <p className="font-display text-2xl font-bold text-deep-pine">
                {formatCurrency(invoice.amountCents)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/80">
          {invoicePaymentTerms}
        </div>

        <div className="mt-8 border-t border-pine/10 pt-4 text-center text-xs font-bold text-charcoal/60">
          {businessInfo.name} · {businessInfo.email} · Invoice {reference}
        </div>
      </section>
    </div>
  );
}

function InvoiceLine({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <span className="font-bold text-charcoal">{label}</span>
      <span className="font-black text-deep-pine">{amount}</span>
    </div>
  );
}

function InvoiceNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-4 font-display text-3xl font-bold text-moss">
        Invoice not found.
      </p>
      <p className="mb-6 text-charcoal/75">
        This invoice has not been set up yet, or the quote could not be loaded.
      </p>
      <Link
        href="/"
        className="inline-flex rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

function formatInvoiceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}