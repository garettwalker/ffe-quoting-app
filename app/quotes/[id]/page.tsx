import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DeleteQuoteButton } from "@/components/delete-quote-button";
import { QuoteStatusButton } from "@/components/quote-status-button";
import { ReopenQuoteButton } from "@/components/reopen-quote-button";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate, formatPercent } from "@/lib/currency";
import { getAdderPriceVariance } from "@/lib/calculations";
import { getEmailHistoryForQuote, receiptsFromHistory } from "@/lib/email-log";
import {
  isPaidInFull,
  lifecycleStage,
  outstandingCents,
  scheduledCents,
  serviceLifecycleStage
} from "@/lib/invoice-calculations";
import { getSupabaseServer } from "@/lib/supabase-server";
import { normalizeQuoteType, normalizeStatus } from "@/lib/types";
import type {
  InvoiceData,
  QuoteCalculationResult,
  QuoteFormState,
  QuoteType,
  ServiceQuoteCalculationResult
} from "@/lib/types";

// Always read the live quote row + invoice data from Supabase (no caching).
export const dynamic = "force-dynamic";

type SavedQuoteRow = {
  id: string;
  quote_id: string;
  quote_type: string | null;
  status: string;
  created_at: string;
  customer_id: string | null;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult | ServiceQuoteCalculationResult;
  invoice_data: InvoiceData | null;
};

// Narrow the calculation snapshot union: a service-call snapshot has `lines`.
function isServiceResult(
  result: QuoteCalculationResult | ServiceQuoteCalculationResult
): result is ServiceQuoteCalculationResult {
  return (result as ServiceQuoteCalculationResult).lines !== undefined;
}

type PageProps = {
  params: { id: string };
};

export default async function SavedQuotePage({ params }: PageProps) {
  const supabase = getSupabaseServer();
  const [{ data, error }, paymentsRes, emailHistory] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_id, quote_type, status, created_at, customer_id, quote_data, calculation_data, invoice_data"
      )
      .eq("id", params.id)
      .single(),
    // Count real payment ledger rows for this job (card / ACH / manual). Any
    // row means money has been taken, so the quote is "protected": deletion
    // is locked behind a type-to-confirm step and reopen warns loudly. head:
    // true returns only the count (mirrors app/quotes/[id]/invoices/page.tsx).
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", params.id),
    getEmailHistoryForQuote(params.id)
  ]);

  if (error || !data) {
    return (
      <AppShell>
        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-8 shadow-soft">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Saved Quote
          </p>
          <h1 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
            Quote not found.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            We could not load this quote. It may have been removed, or the link
            may be incorrect.
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
  const result = row.calculation_data;
  const status = normalizeStatus(row.status);
  const quoteType: QuoteType = normalizeQuoteType(row.quote_type);
  const isService = quoteType === "service_call";
  const newBuildResult = !isServiceResult(result) ? result : null;
  // Prefer the customer_id column (source of truth, set by backfill) over the
  // JSONB snapshot so a backfilled quote still links to its customer record.
  const customerId = quote.customerId ?? row.customer_id ?? undefined;
  // Emailed-state of each invoice, derived from the email history already
  // fetched for the history table. A finish/service invoice that has never been
  // emailed (and isn't paid) is "scheduled" — not owed yet — so it is excluded
  // from the outstanding balance and keeps the job from reading as paid in full.
  const receipts = receiptsFromHistory(emailHistory);
  // Net effect of per-line unit-price overrides — the bridge from
  // "(before-adjustments x multiplier)" to the final quote. Zero (hidden)
  // when no adder lines are custom-priced. Computed on the fly so historical
  // quotes saved before the field existed reconcile too. New-build only;
  // service calls have no multipliers / overrides.
  const varianceCents = newBuildResult ? getAdderPriceVariance(newBuildResult) : 0;
  const varianceTotal =
    varianceCents >= 0
      ? `+${formatCurrency(varianceCents)}`
      : formatCurrency(varianceCents);

  // Protection state for the delete + reopen guards. Mirrors the guard on the
  // invoicing page: any payment ledger row or any paid invoice means real money
  // is tied to this quote, so deleting it is locked behind type-to-confirm and
  // reopening it warns that a paid job will look un-invoiced on the dashboard.
  const paymentCount = paymentsRes.count ?? 0;
  const hasInvoices = !!row.invoice_data;
  const hasPaidInvoice = Boolean(
    row.invoice_data &&
      row.invoice_data.invoices.some((inv) => inv.status === "paid")
  );

  // The display name shown in the H1. Reused as the type-to-match token for the
  // locked delete, so the user types exactly the name they see on the page.
  const jobName = quote.projectName || quote.clientName || "Unnamed Client";

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const createdDate = new Date(row.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Link
            href="/quotes"
            className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
          >
            Back to quotes
          </Link>

          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Saved Quote
          </p>

          <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
            {jobName}
          </h1>

          {quote.projectName ? (
            <p className="mt-2 text-base font-bold leading-7 text-charcoal/65">
              {quote.clientName}
            </p>
          ) : null}

          <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
            {fullAddress || "No project address entered"}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge
              stage={
                isService
                  ? serviceLifecycleStage(status, row.invoice_data, receipts)
                  : lifecycleStage(status, row.invoice_data, receipts)
              }
            />
            <span className="text-sm font-bold text-charcoal/60">
              Saved {createdDate}
            </span>
          </div>
        </div>

        <div className="rounded-xl1 border border-pine/10 bg-whitewarm/75 px-5 py-4 shadow-card">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-clay">
            Final Total
          </p>
          <p className="font-display text-4xl font-bold tracking-[-0.04em] text-deep-pine">
            {formatCurrency(result.clientQuoteTotalCents)}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Customer Quote Summary
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <ReviewField label="Quote ID" value={quote.quoteId} />
            <ReviewField label="Quote Date" value={quote.quoteDate} />
            <ReviewField
              label="Project Name"
              value={quote.projectName || "Not entered"}
            />
            <ReviewField label="Builder / Customer" value={quote.clientName} />
            <ReviewField
              label="Builder / Customer Email"
              value={quote.clientEmail || "Not entered"}
            />
            <ReviewField label="Project Address" value={fullAddress} />
            <ReviewField label="Project Type" value={quote.projectType} />
            {isService ? null : (
              <ReviewField
                label="Square Footage"
                value={quote.squareFootage.toLocaleString()}
              />
            )}
            {isService || !newBuildResult ? null : (
              <ReviewField
                label="Base Rate"
                value={`${newBuildResult.baseRateLabel ?? "Base rate"} - ${formatCurrency(newBuildResult.baseRateCents)}/sf`}
              />
            )}
          </div>

          <div className="mt-8">
            <p className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-clay">
              {isService ? "Line Items" : "Customer-Facing Line Items"}
            </p>

            <div className="responsive-table-wrap rounded-xl1 border border-pine/10">
              <table className="responsive-table w-full border-collapse text-left text-sm">
                <thead className="bg-sand text-deep-pine">
                  <tr>
                    <th className="p-3 font-black">Item</th>
                    <th className="p-3 font-black">Qty</th>
                    {isService ? (
                      <th className="p-3 font-black">Amount</th>
                    ) : (
                      <>
                        <th className="p-3 font-black">Unit</th>
                        <th className="p-3 font-black">Unit Price</th>
                        <th className="p-3 font-black">Line Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-pine/10 bg-cream">
                  {isService
                    ? quote.serviceLines.map((line) => (
                        <tr key={line.id}>
                          <td className="p-3 font-bold text-charcoal">
                            <div>{line.name}</div>
                            {line.comment ? (
                              <div className="mt-1 break-words text-xs font-medium italic leading-5 text-charcoal/60">
                                {line.comment}
                              </div>
                            ) : null}
                          </td>
                          <td className="p-3">{line.quantity.toLocaleString()}</td>
                          <td className="p-3 font-black text-deep-pine">
                            {formatCurrency(line.amountCents)}
                          </td>
                        </tr>
                      ))
                    : newBuildResult?.clientFacingLines.map((line) => (
                        <tr key={line.pricingItemId}>
                          <td className="p-3 font-bold text-charcoal">
                            <div>{line.name}</div>
                            {line.comment ? (
                              <div className="mt-1 break-words text-xs font-medium italic leading-5 text-charcoal/60">
                                {line.comment}
                              </div>
                            ) : null}
                          </td>
                          <td className="p-3">{line.quantity.toLocaleString()}</td>
                          <td className="p-3">{line.unitType}</td>
                          <td className="p-3">
                            {formatCurrency(line.clientUnitPriceCents)}
                          </td>
                          <td className="p-3 font-black text-deep-pine">
                            {formatCurrency(line.clientLineTotalCents)}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>

          {!isService && newBuildResult ? (
            <div className="mt-8">
              <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
                Internal Math Breakdown
              </p>
              <p className="mb-4 text-xs font-medium leading-5 text-charcoal/55">
                Not shown to the customer. Each lever is tagged with what it moves:
                the Base Package only, the adders only, or both.
              </p>

              <div className="space-y-2 rounded-xl1 border border-pine/10 bg-cream p-4">
                <BreakdownRow
                  label={`Base rate (${newBuildResult.baseRateLabel ?? "Base rate"})`}
                  value={`${formatCurrency(newBuildResult.baseRateCents)}/sf x ${quote.squareFootage.toLocaleString()} sf`}
                  total={formatCurrency(newBuildResult.basePackageBaseTotalCents)}
                  scope="Base pkg only"
                />
                <BreakdownRow
                  label="Selected adders (catalog base prices)"
                  value={
                    (newBuildResult.overriddenAdderLineCount ?? 0) > 0
                      ? `${newBuildResult.overriddenAdderLineCount} custom-priced line${
                          (newBuildResult.overriddenAdderLineCount ?? 0) === 1 ? "" : "s"
                        } skip the multipliers`
                      : "pre-multiplier adder totals"
                  }
                  total={formatCurrency(newBuildResult.selectedAddersBaseTotalCents)}
                  scope="Adders only"
                />
                <BreakdownRow
                  label="Before adjustments"
                  value="base pkg + adders"
                  total={formatCurrency(newBuildResult.totalBeforeClientMultiplierCents)}
                />
                <BreakdownRow
                  label={`Pricing level: ${newBuildResult.pricingLevelName ?? "Standard"}`}
                  value={formatPercent(newBuildResult.pricingLevelMultiplier)}
                  scope="Base + adders"
                />
                <BreakdownRow
                  label={`Contingency: ${newBuildResult.contingencyName ?? "0%"}`}
                  value={formatPercent(newBuildResult.contingencyMultiplier)}
                  scope="Base + adders"
                />
                <BreakdownRow
                  label="Combined multiplier"
                  value={formatPercent(newBuildResult.combinedClientMultiplier)}
                  scope="Base + adders"
                />
                {varianceCents !== 0 ? (
                  <BreakdownRow
                    label="Adder price variance (vs price list)"
                    value="custom-priced lines vs catalog base"
                    total={varianceTotal}
                    scope="Adders only"
                  />
                ) : null}
                <div className="flex items-center justify-between gap-4 border-t border-pine/15 pt-3">
                  <span className="text-sm font-black text-deep-pine">
                    Final Quote
                  </span>
                  <span className="text-sm font-black text-deep-pine">
                    {formatCurrency(newBuildResult.clientQuoteTotalCents)}
                  </span>
                </div>
                <p className="text-xs font-bold leading-5 text-charcoal/55">
                  {formatCurrency(newBuildResult.totalBeforeClientMultiplierCents)} ×{" "}
                  {formatPercent(newBuildResult.combinedClientMultiplier)}
                  {varianceCents !== 0 ? ` + ${varianceTotal}` : ""} ={" "}
                  {formatCurrency(newBuildResult.clientQuoteTotalCents)}
                </p>
                {(newBuildResult.overriddenAdderLineCount ?? 0) > 0 ? (
                  <p className="text-xs font-bold leading-4 text-charcoal/55">
                    Includes {newBuildResult.overriddenAdderLineCount} custom-priced adder
                    line{(newBuildResult.overriddenAdderLineCount ?? 0) === 1 ? "" : "s"}{" "}
                    added at their set price (multipliers skipped).
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="rounded-xl2 border border-pine/10 bg-whitewarm/80 p-6 shadow-soft lg:sticky lg:top-28">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Next Actions
          </p>

          <div className="grid gap-3">
            <Link
              href="/quotes"
              className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              Back to Quotes
            </Link>

            <Link
              href={`/quotes/${row.id}/pnl`}
              className="rounded-full border border-clay/30 px-5 py-3 text-center font-black text-clay hover:bg-clay/10"
            >
              Job P&amp;L (internal)
            </Link>

            {customerId ? (
              <Link
                href={`/customers/${customerId}`}
                className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
              >
                Customer record
              </Link>
            ) : null}

            {status === "draft" ? (
              <>
                <Link
                  href={`/quotes/${row.id}/edit`}
                  className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
                >
                  Continue editing
                </Link>
                <QuoteStatusButton
                  quoteId={row.id}
                  newStatus="prepared"
                  label="Prepare"
                  variant="primary"
                />
              </>
            ) : null}

            {status === "prepared" ? (
              <>
                <Link
                  href={`/quotes/${row.id}/edit`}
                  className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
                >
                  Edit Saved Quote
                </Link>
                <QuoteStatusButton
                  quoteId={row.id}
                  newStatus="accepted"
                  label="Mark accepted"
                  variant="primary"
                />
                <Link
                  href={`/quotes/${row.id}/print`}
                  className="rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card hover:bg-deep-pine"
                >
                  {isService ? "Quote PDF" : "Detailed Quote PDF"}
                </Link>
                {isService ? null : (
                  <Link
                    href={`/quotes/${row.id}/summary`}
                    className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
                  >
                    Summary Quote PDF
                  </Link>
                )}
                <QuoteStatusButton
                  quoteId={row.id}
                  newStatus="draft"
                  label="Move back to drafts"
                  variant="secondary"
                />
              </>
            ) : null}

            {status === "accepted" ? (
              <>
                <Link
                  href={`/quotes/${row.id}/print`}
                  className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
                >
                  {isService ? "Quote PDF" : "Detailed Quote PDF"}
                </Link>
                {isService ? null : (
                  <Link
                    href={`/quotes/${row.id}/summary`}
                    className="rounded-full border border-pine/20 px-5 py-3 text-center font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
                  >
                    Summary Quote PDF
                  </Link>
                )}
                <Link
                  href={`/quotes/${row.id}/invoices`}
                  className="rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card hover:bg-deep-pine"
                >
                  Invoicing
                </Link>
                {isService ? (
                  <QuoteStatusButton
                    quoteId={row.id}
                    newStatus="scheduled"
                    label="Mark scheduled"
                    variant="primary"
                  />
                ) : null}
                <ReopenQuoteButton
                  quoteId={row.id}
                  hasInvoices={hasInvoices}
                  hasPaidInvoice={hasPaidInvoice}
                  paymentCount={paymentCount}
                />
              </>
            ) : null}

            {status === "scheduled" ? (
              <>
                <Link
                  href={`/quotes/${row.id}/invoices`}
                  className="rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card hover:bg-deep-pine"
                >
                  Invoicing
                </Link>
                <QuoteStatusButton
                  quoteId={row.id}
                  newStatus="accepted"
                  label="Move back to accepted"
                  variant="secondary"
                />
                <ReopenQuoteButton
                  quoteId={row.id}
                  hasInvoices={hasInvoices}
                  hasPaidInvoice={hasPaidInvoice}
                  paymentCount={paymentCount}
                />
              </>
            ) : null}
          </div>

          {(status === "accepted" || status === "scheduled") && row.invoice_data ? (
            (() => {
              const paidInFull = isPaidInFull(row.invoice_data, receipts);
              const owed = outstandingCents(row.invoice_data, receipts);
              const scheduled = scheduledCents(row.invoice_data, receipts);
              return (
                <p className="mt-4 rounded-soft bg-cream px-4 py-3 text-sm font-black text-deep-pine">
                  {paidInFull
                    ? "Invoices: paid in full"
                    : owed > 0
                      ? `Outstanding: ${formatCurrency(owed)}`
                      : scheduled > 0
                        ? `Scheduled / not yet billed: ${formatCurrency(scheduled)}`
                        : "Invoices: paid in full"}
                </p>
              );
            })()
          ) : null}

          <div className="mt-6">
            <DeleteQuoteButton
              quoteId={row.id}
              jobName={jobName}
              hasInvoices={hasInvoices}
              hasPaidInvoice={hasPaidInvoice}
              paymentCount={paymentCount}
            />
          </div>

          <div className="mt-6 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/70">
            Status changes save instantly to Supabase and move the quote through
            the dashboard stages: Draft, Prepared, Client Accepted, Pending
            Payments, and Paid in Full. Accepted quotes move into Pending
            Payments once invoices are set up, and into Paid in Full once every
            invoice is marked paid.
          </div>
        </aside>
      </div>

      {emailHistory.length > 0 ? (
        <section className="mt-8 rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Email History
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-sand text-deep-pine">
                <tr>
                  <th className="p-3 font-black">Date</th>
                  <th className="p-3 font-black">Document</th>
                  <th className="p-3 font-black">Recipient</th>
                  <th className="p-3 font-black">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pine/10 bg-cream">
                {emailHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap p-3 text-charcoal/80">
                      {formatDate(entry.sent_at)}
                    </td>
                    <td className="p-3">
                      <p className="font-bold text-charcoal">{entry.doc_title}</p>
                      {entry.subject ? (
                        <p className="text-xs text-charcoal/60">
                          {entry.subject}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 text-charcoal/80">{entry.recipient}</td>
                    <td className="p-3">
                      {entry.status === "sent" ? (
                        <span className="rounded-full bg-pine/15 px-3 py-1 text-xs font-black text-deep-pine">
                          Sent
                        </span>
                      ) : (
                        <span
                          className="rounded-full bg-clay/20 px-3 py-1 text-xs font-black text-clay"
                          title={entry.error || "Send failed"}
                        >
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {quote.internalNotes.trim() ? (
        <section className="mt-8 rounded-xl2 border border-clay/25 bg-cream/60 p-6 shadow-soft">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Internal Notes (not shown to customer)
          </p>
          <p className="whitespace-pre-wrap font-bold leading-7 text-charcoal/80">
            {quote.internalNotes}
          </p>
        </section>
      ) : null}
    </AppShell>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-soft border border-pine/10 bg-cream p-4">
      <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
        {label}
      </p>
      <p className="break-words font-black text-deep-pine">{value}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  total,
  scope
}: {
  label: string;
  value: string;
  total?: string;
  scope?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span className="block text-sm font-bold text-charcoal/70">{label}</span>
        <span className="block text-xs font-medium text-charcoal/45">{value}</span>
        {scope ? (
          <span className="mt-1 inline-block rounded-full bg-sage/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-deep-pine">
            {scope}
          </span>
        ) : null}
      </div>
      {total ? (
        <span className="shrink-0 text-right text-sm font-black text-deep-pine">
          {total}
        </span>
      ) : null}
    </div>
  );
}