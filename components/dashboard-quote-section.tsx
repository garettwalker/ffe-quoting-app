import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { isFullyPaid, lifecycleStage, outstandingCents } from "@/lib/invoice-calculations";
import type { DashboardQuoteRow } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { QuoteStatusButton } from "@/components/quote-status-button";

export function DashboardQuoteSection({
  eyebrow,
  title,
  description,
  quotes,
  emptyCopy
}: {
  eyebrow: string;
  title: string;
  description?: string;
  quotes: DashboardQuoteRow[];
  emptyCopy: string;
}) {
  return (
    <section className="mb-8 rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
            {eyebrow}
          </p>
          <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm font-bold text-charcoal/65">
              {description}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-sand px-3 py-1 text-xs font-black text-deep-pine">
          {quotes.length}
        </span>
      </div>

      {quotes.length === 0 ? (
        <p className="rounded-xl1 border border-pine/10 bg-cream p-5 text-sm font-bold text-charcoal/60">
          {emptyCopy}
        </p>
      ) : (
        <div className="grid gap-3">
          {quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} />
          ))}
        </div>
      )}
    </section>
  );
}

function QuoteCard({ quote }: { quote: DashboardQuoteRow }) {
  const address = [
    quote.project_street,
    quote.project_city,
    quote.project_state,
    quote.project_zip
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-xl1 border border-pine/10 bg-cream p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-deep-pine">{quote.quote_id}</span>
            <StatusBadge stage={lifecycleStage(quote.status, quote.invoice_data)} />
          </div>
          <p className="mt-1 font-bold text-charcoal">{quote.client_name}</p>
          <p className="text-sm text-charcoal/70">{address}</p>

          {quote.status === "accepted" && quote.invoice_data ? (
            <p
              className={`mt-1 text-sm font-black ${
                isFullyPaid(quote.invoice_data) ? "text-deep-pine" : "text-clay"
              }`}
            >
              {isFullyPaid(quote.invoice_data)
                ? "Invoices paid in full"
                : `Outstanding: ${formatCurrency(outstandingCents(quote.invoice_data))}`}
            </p>
          ) : null}
        </div>

        <p className="font-display text-lg font-bold text-deep-pine md:text-right">
          {formatCurrency(quote.client_quote_total_cents)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CardActions quote={quote} />
      </div>
    </div>
  );
}

function CardActions({ quote }: { quote: DashboardQuoteRow }) {
  const openLink = (
    <Link
      href={`/quotes/${quote.id}`}
      className="rounded-full border border-pine/20 px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
    >
      Open
    </Link>
  );

  const printLink = (
    <Link
      href={`/quotes/${quote.id}/print`}
      className="rounded-full border border-pine/20 px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
    >
      PDF
    </Link>
  );

  const summaryLink = (
    <Link
      href={`/quotes/${quote.id}/summary`}
      className="rounded-full border border-pine/20 px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
    >
      Summary
    </Link>
  );

  const continueLink = (
    <Link
      href={`/quotes/${quote.id}/edit`}
      className="rounded-full border border-pine/20 px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
    >
      Continue
    </Link>
  );

  if (quote.status === "draft") {
    return (
      <>
        {continueLink}
        <QuoteStatusButton
          quoteId={quote.id}
          newStatus="prepared"
          label="Prepare"
          variant="primary"
          size="sm"
        />
        {openLink}
      </>
    );
  }

  if (quote.status === "prepared") {
    return (
      <>
        {openLink}
        <QuoteStatusButton
          quoteId={quote.id}
          newStatus="accepted"
          label="Mark accepted"
          variant="primary"
          size="sm"
        />
        {printLink}
        {summaryLink}
      </>
    );
  }

  return (
    <>
      {openLink}
      {printLink}
      {summaryLink}
      <Link
        href={`/quotes/${quote.id}/invoices`}
        className="rounded-full bg-pine px-4 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
      >
        Invoicing
      </Link>
    </>
  );
}