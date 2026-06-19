import Image from "next/image";
import Link from "next/link";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { formatCurrency } from "@/lib/currency";
import { loadDetailedQuotePdfInput } from "@/lib/detailed-quote-pdf";

type PageProps = {
  params: { id: string };
};

// Always read the live business info / quote notes from Supabase.
export const dynamic = "force-dynamic";

export default async function PrintQuotePage({ params }: PageProps) {
  const input = await loadDetailedQuotePdfInput(params.id);

  if (!input) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="mb-4 font-display text-3xl font-bold text-moss">
          Quote not found.
        </p>
        <Link
          href="/quotes"
          className="inline-flex rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine"
        >
          Back to Quotes
        </Link>
      </div>
    );
  }

  const { quote, result, settings, fullAddress, quoteDateLabel } = input;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <DownloadPdfButton
        href={`/quotes/${params.id}/print/pdf`}
        backHref={`/quotes/${params.id}`}
        backLabel="Back to quote"
        buttonLabel="Download PDF"
      />

      <section className="rounded-xl2 border border-pine/10 bg-whitewarm p-8 shadow-soft">
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
                {settings.businessName}
              </p>
              <p className="text-sm font-bold text-charcoal/70">
                {settings.businessEmail}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="font-display text-3xl font-bold tracking-[-0.03em] text-moss">
              Quote
            </p>
            <p className="mt-1 text-sm font-black text-deep-pine">
              {quote.quoteId}
            </p>
            <p className="text-sm text-charcoal/70">{quoteDateLabel}</p>
          </div>
        </div>

        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
              Prepared For
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

        <div className="overflow-hidden rounded-xl1 border border-pine/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-sand text-deep-pine">
              <tr>
                <th className="p-3 font-black">Item</th>
                <th className="p-3 text-right font-black">Qty</th>
                <th className="p-3 font-black">Unit</th>
                <th className="p-3 text-right font-black">Unit Price</th>
                <th className="p-3 text-right font-black">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pine/10 bg-cream">
              {result.clientFacingLines.map((line) => (
                <tr key={line.pricingItemId}>
                  <td className="p-3 font-bold text-charcoal">{line.name}</td>
                  <td className="p-3 text-right">
                    {line.quantity.toLocaleString()}
                  </td>
                  <td className="p-3">{line.unitType}</td>
                  <td className="p-3 text-right">
                    {formatCurrency(line.clientUnitPriceCents)}
                  </td>
                  <td className="p-3 text-right font-black text-deep-pine">
                    {formatCurrency(line.clientLineTotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs rounded-xl1 border border-pine/15 bg-cream px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black uppercase tracking-[0.12em] text-clay">
                Quote Total
              </p>
              <p className="font-display text-2xl font-bold text-deep-pine">
                {formatCurrency(result.clientQuoteTotalCents)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/80">
          {settings.defaultQuoteNotes}
        </div>

        <div className="mt-8 border-t border-pine/10 pt-4 text-center text-xs font-bold text-charcoal/60">
          {settings.businessName} · {settings.businessEmail} · Quote {quote.quoteId}
        </div>
      </section>
    </div>
  );
}