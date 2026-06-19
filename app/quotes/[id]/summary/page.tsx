import Image from "next/image";
import Link from "next/link";
import { PrintQuoteButton } from "@/components/print-quote-button";
import { formatCurrency } from "@/lib/currency";
import { summarizeByCategory } from "@/lib/calculations";
import { getSettings } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import type { QuoteCalculationResult, QuoteFormState } from "@/lib/types";

type SavedQuoteRow = {
  id: string;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult;
};

type PageProps = {
  params: { id: string };
};

// Always read the live business info / quote notes from Supabase.
export const dynamic = "force-dynamic";

// Printable Summary Quote: a condensed, customer-facing version of the quote
// that shows one subtotal per pricing category instead of every line item.
// Mirrors the Detailed Quote printable page (logo + business header, Prepared
// For / Project blocks, total box, notes, footer) and reuses the same
// browser-print pattern (PrintQuoteButton + .print-document). No unit prices
// are shown, only category subtotals and the quote total.
export default async function SummaryQuotePage({ params }: PageProps) {
  const [quoteResult, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_data, calculation_data")
      .eq("id", params.id)
      .single(),
    getSettings()
  ]);

  const { data, error } = quoteResult;

  if (error || !data || !data.quote_data || !data.calculation_data) {
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

  const row = data as SavedQuoteRow;
  const quote = row.quote_data;
  const result = row.calculation_data;
  const categories = summarizeByCategory(result);

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PrintQuoteButton quoteId={row.id} />

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
                {settings.businessName}
              </p>
              <p className="text-sm font-bold text-charcoal/70">
                {settings.businessEmail}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-[-0.03em] text-moss md:text-3xl">
              Summary Quote
            </p>
            <p className="mt-1 text-sm font-black text-deep-pine">
              {quote.quoteId}
            </p>
            <p className="text-sm text-charcoal/70">
              {formatQuoteDate(quote.quoteDate)}
            </p>
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

        <p className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-clay">
          Scope Summary
        </p>

        <div className="overflow-hidden rounded-xl1 border border-pine/10">
          <div className="divide-y divide-pine/10 bg-cream">
            {categories.length === 0 ? (
              <div className="p-3 text-sm font-bold text-charcoal/60">
                No priced items on this quote.
              </div>
            ) : (
              categories.map((entry) => (
                <SummaryLine
                  key={entry.category}
                  label={categoryLabel(entry.category)}
                  amount={formatCurrency(entry.totalCents)}
                />
              ))
            )}
          </div>
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
          {settings.businessName} · {settings.businessEmail} · Summary Quote{" "}
          {quote.quoteId}
        </div>
      </section>
    </div>
  );
}

function SummaryLine({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <span className="font-bold text-charcoal">{label}</span>
      <span className="font-black text-deep-pine">{amount}</span>
    </div>
  );
}

// Friendly display names for categories on the summary. "Base" reads better as
// "Base Package"; everything else uses its raw category name.
function categoryLabel(category: string): string {
  if (category === "Base") return "Base Package";
  return category;
}

function formatQuoteDate(value: string): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}