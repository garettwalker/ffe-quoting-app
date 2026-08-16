import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import type { InvoiceReceipts } from "@/lib/email-log";
import {
  isPaidInFull,
  lifecycleStage,
  outstandingCents,
  scheduledFinishCents
} from "@/lib/invoice-calculations";
import type { DashboardQuoteRow } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { QuoteStatusButton } from "@/components/quote-status-button";

export function DashboardQuoteSection({
  eyebrow,
  title,
  description,
  quotes,
  emptyCopy,
  receiptsById
}: {
  eyebrow: string;
  title: string;
  description?: string;
  quotes: DashboardQuoteRow[];
  emptyCopy: string;
  // Per-quote emailed-state of invoices: a not-yet-emailed finish is "scheduled"
  // (not owed yet). Omitted or a missing id = no emailed finish (legacy). Drives
  // the card's lifecycle stage and outstanding/pending copy.
  receiptsById?: Map<string, InvoiceReceipts>;
}) {
  const receiptsOf = (id: string): InvoiceReceipts | undefined =>
    receiptsById?.get(id);

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
            <QuoteCard
              key={quote.id}
              quote={quote}
              receipts={receiptsOf(quote.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QuoteCard({
  quote,
  receipts
}: {
  quote: DashboardQuoteRow;
  receipts?: InvoiceReceipts;
}) {
  const address = [
    quote.project_street,
    quote.project_city,
    quote.project_state,
    quote.project_zip
  ]
    .filter(Boolean)
    .join(", ");

  const paidInFull = isPaidInFull(quote.invoice_data, receipts);
  const owed = outstandingCents(quote.invoice_data, receipts);
  const finishPending = scheduledFinishCents(quote.invoice_data, receipts);

  return (
    <div className="rounded-xl1 border border-pine/10 bg-cream p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-deep-pine">{quote.quote_id}</span>
            <StatusBadge
              stage={lifecycleStage(quote.status, quote.invoice_data, receipts)}
            />
          </div>
          <p className="mt-1 font-bold text-charcoal">
            {quote.project_name || quote.client_name}
          </p>
          {quote.project_name ? (
            <p className="text-sm text-charcoal/60">{quote.client_name}</p>
          ) : null}
          <p className="text-sm text-charcoal/70">{address}</p>

          {quote.status === "accepted" && quote.invoice_data ? (
            <p
              className={`mt-1 text-sm font-black ${
                paidInFull ? "text-deep-pine" : "text-clay"
              }`}
            >
              {paidInFull
                ? "Invoices paid in full"
                : owed > 0
                  ? `Outstanding: ${formatCurrency(owed)}`
                  : finishPending > 0
                    ? `Finish pending: ${formatCurrency(finishPending)}`
                    : "Invoices paid in full"}
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