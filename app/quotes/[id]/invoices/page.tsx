import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InvoiceBuilder } from "@/components/invoice-builder";
import { InvoicePaidButton } from "@/components/invoice-paid-button";
import { InvoicePaidBadge } from "@/components/status-badge";
import { DeleteInvoicesButton } from "@/components/delete-invoices-button";
import { formatCurrency } from "@/lib/currency";
import {
  invoiceDisplayNumber,
  outstandingCents,
  isPaidInFull,
  scheduledFinishCents
} from "@/lib/invoice-calculations";
import { getEmailHistoryForQuote, receiptsFromHistory } from "@/lib/email-log";
import { buildPayUrl } from "@/lib/pay-token";
import { getServerUser } from "@/lib/auth";
import { CopyPayLinkButton } from "@/components/pay/copy-pay-link-button";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getPricingCatalog } from "@/lib/pricing";
import type {
  InvoiceData,
  InvoiceKind,
  PricingItem,
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
  const supabase = getSupabaseServer();
  const [user, { data, error }, catalog, paymentsRes, stripePaidRes, emailHistory] = await Promise.all([
    getServerUser(),
    supabase
      .from("quotes")
      .select(
        "id, quote_id, status, quote_data, calculation_data, invoice_data"
      )
      .eq("id", params.id)
      .single(),
    getPricingCatalog(),
    // Count real payment ledger rows for this job (card / ACH / manual). Any
    // row means money has been taken and the invoice setup cannot be cleared
    // without orphaning the audit trail. head: true returns only the count.
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", params.id),
    // Succeeded ONLINE payments (card / ACH) per invoice kind. A succeeded
    // Stripe row means real money was collected; the Mark Unpaid button is
    // blocked for that invoice because flipping the flag back to unpaid here
    // would desync it from the ledger (AR would show money owed that was
    // collected). The reversal path for real online money is a Stripe refund,
    // which the webhook catches (charge.refunded) and flips the flag itself.
    // Manual-paid invoices are not blocked: Mark Unpaid reverses those.
    supabase
      .from("payments")
      .select("invoice_kind")
      .eq("quote_id", params.id)
      .neq("method", "manual")
      .eq("status", "succeeded"),
    // Emailed-state of each invoice. A finish invoice that has never been
    // emailed (and isn't paid) is "scheduled" — not owed yet — so it is
    // excluded from the outstanding balance and keeps the job from reading
    // as paid in full.
    getEmailHistoryForQuote(params.id)
  ]);

  if (error || !data || !data.quote_data || !data.calculation_data) {
    notFound();
  }

  const row = data as InvoicePageRow;
  const quote = row.quote_data;
  const result = row.calculation_data;
  const invoiceData = row.invoice_data;
  // Emailed-state of each invoice from the email history. A finish that has
  // never been emailed (and isn't paid) is "scheduled" and not owed yet.
  const receipts = receiptsFromHistory(emailHistory);

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

  // Once the rough-in (initial) invoice is paid, it is frozen and edits flow
  // only to the finish invoice (see computeInvoiceAmounts). Used to tailor the
  // header hint, the aside note, and the invoice-card copy below.
  const roughInPaid = initialInvoice?.status === "paid";

  const contractTotalCents = invoiceData
    ? invoiceData.contractAmountCents
    : result.clientQuoteTotalCents;

  // Guard for "Delete invoices": block when a payment has been recorded (ledger
  // row) or any invoice is flagged paid. Either means real money is tied to
  // this setup and clearing it would orphan the audit trail.
  const paymentCount = paymentsRes.count ?? 0;
  const hasPaidInvoice = Boolean(
    invoiceData && invoiceData.invoices.some((inv) => inv.status === "paid")
  );
  const deleteBlocked = paymentCount > 0 || hasPaidInvoice;
  const deleteBlockedReason =
    paymentCount > 0
      ? "A payment has been recorded on this job (card, ACH, or manual), so the invoices cannot be deleted without orphaning that payment record. Reverse the payment in Stripe first if needed, then try again."
      : "An invoice on this job is marked paid, so the invoices cannot be deleted. Mark it unpaid first (which also removes its manual ledger row), then try again.";

  // Invoice kinds that have a succeeded online (card / ACH) payment. Marking
  // those unpaid is blocked (see InvoicePaidButton).
  const stripePaidKinds = new Set<string>(
    ((stripePaidRes.data ?? []) as { invoice_kind: string }[]).map(
      (r) => r.invoice_kind
    )
  );
  const markUnpaidBlockedReason =
    "This invoice was paid online by card or bank transfer, so it can't be marked unpaid from here. To reverse it, issue a refund in Stripe and this invoice will mark itself unpaid automatically once the refund is confirmed.";

  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
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
            {quote.projectName || quote.clientName || "Unnamed Client"}
          </h1>
          {quote.projectName ? (
            <p className="mt-2 text-base font-bold leading-7 text-charcoal/65">
              {quote.clientName}
            </p>
          ) : null}
          <p className="mt-3 max-w-2xl text-base leading-7 text-charcoal/70">
            {fullAddress || "No project address entered"}
          </p>

          {invoiceData ? (
            (() => {
              const paidInFull = isPaidInFull(invoiceData, receipts);
              const owed = outstandingCents(invoiceData, receipts);
              const finishPending = scheduledFinishCents(invoiceData, receipts);
              return (
                <p className="mt-4 inline-flex rounded-full bg-cream px-4 py-2 text-sm font-black text-deep-pine">
                  {paidInFull
                    ? "Paid in full"
                    : owed > 0
                      ? `Outstanding: ${formatCurrency(owed)}`
                      : finishPending > 0
                        ? `Finish pending: ${formatCurrency(finishPending)}`
                        : "Paid in full"}
                </p>
              );
            })()
          ) : null}
        </div>

        <div className="rounded-xl1 border border-pine/10 bg-whitewarm/75 px-5 py-4 shadow-card">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-clay">
            {invoiceData ? "Contract Total" : "Quote Total"}
          </p>
          <p className="font-display text-4xl font-bold tracking-[-0.04em] text-deep-pine">
            {formatCurrency(contractTotalCents)}
          </p>
          <p className="mt-1 text-xs font-bold text-charcoal/60">
            {row.quote_id}
          </p>
          {roughInPaid ? (
            <p className="mt-2 text-xs font-bold leading-5 text-clay">
              Rough-in is paid. Changes to line items apply to the final invoice
              only.
            </p>
          ) : null}
        </div>
      </div>

      {/* How invoicing works — full-width note at the top of the page. Lives
          above the builder so it reads first and no longer eats the side
          column; the dynamic copy flips when the rough-in is paid and locked. */}
      <div className="mb-8 rounded-xl1 border border-pine/10 bg-whitewarm/80 p-4 shadow-soft">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
          <p className="shrink-0 text-sm font-black uppercase tracking-[0.16em] text-clay">
            How invoicing works
          </p>
          <p className="text-sm font-bold leading-6 text-charcoal/75">
            {roughInPaid
              ? "The contract is the sum of the line items. The rough-in invoice is paid and locked, so any change to the line items, contract, or permit fee adjusts the final invoice only. Mark the final invoice paid when it is collected."
              : "The contract is the sum of the line items. The initial invoice is the rough-in percent of that contract plus the permit fee; the final invoice is the remainder. Mark each invoice paid as it is collected."}
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        <InvoiceBuilder
          quoteId={row.id}
          initialInvoiceData={invoiceData}
          quoteTotalCents={result.clientQuoteTotalCents}
          pricingItems={catalog.items}
          // Default unit price for a line added on the invoice = catalog base
          // price x the quote's pricing-level/contingency multiplier, so an
          // added line matches the job's pricing level (still editable).
          clientMultiplier={result.combinedClientMultiplier}
          seedScopeLines={result.clientFacingLines.map((line) => ({
            pricingItemId: line.pricingItemId,
            name: line.name,
            unitType: line.unitType,
            quantity: line.quantity,
            unitPriceCents: line.clientUnitPriceCents,
            comment: line.comment
          }))}
        />

        {invoiceData ? (
          <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
            <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Current invoices
            </p>

            <div className="grid gap-4">
              {initialInvoice ? (
                <InvoiceCard
                  quoteId={row.id}
                  invoiceData={invoiceData}
                  kind="initial"
                  reference={invoiceDisplayNumber(row.quote_id, initialInvoice)}
                  title="Invoice 1: Rough-In (Initial)"
                  amountCents={initialInvoice.amountCents}
                  status={initialInvoice.status}
                  recordedBy={user?.email ?? ""}
                  payUrl={buildPayUrl(row.id, "initial")}
                  markUnpaidBlocked={stripePaidKinds.has("initial")}
                  markUnpaidBlockedReason={markUnpaidBlockedReason}
                />
              ) : null}

              {finishInvoice ? (
                <InvoiceCard
                  quoteId={row.id}
                  invoiceData={invoiceData}
                  kind="finish"
                  reference={invoiceDisplayNumber(row.quote_id, finishInvoice)}
                  title="Invoice 2: Final"
                  amountCents={finishInvoice.amountCents}
                  status={finishInvoice.status}
                  recordedBy={user?.email ?? ""}
                  payUrl={buildPayUrl(row.id, "finish")}
                  markUnpaidBlocked={stripePaidKinds.has("finish")}
                  markUnpaidBlockedReason={markUnpaidBlockedReason}
                />
              ) : null}
            </div>

            <div className="mt-6 border-t border-pine/10 pt-5">
              <DeleteInvoicesButton
                quoteId={row.id}
                blocked={deleteBlocked}
                blockedReason={deleteBlockedReason}
              />
            </div>
          </section>
        ) : (
          <section className="rounded-xl2 border border-pine/10 bg-cream p-6 text-sm font-bold text-charcoal/70">
            No invoices yet. Set up the line items, split, and permit fee
            above, then click Save Invoices.
          </section>
        )}
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
  status,
  recordedBy,
  payUrl,
  markUnpaidBlocked,
  markUnpaidBlockedReason
}: {
  quoteId: string;
  invoiceData: InvoiceData;
  kind: InvoiceKind;
  reference: string;
  title: string;
  amountCents: number;
  status: "unpaid" | "paid";
  recordedBy: string;
  payUrl: string | null;
  markUnpaidBlocked: boolean;
  markUnpaidBlockedReason: string;
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
          className="inline-flex items-center justify-center rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card transition hover:bg-deep-pine"
        >
          View invoice
        </Link>
        <InvoicePaidButton
          quoteId={quoteId}
          invoiceData={invoiceData}
          kind={kind}
          recordedBy={recordedBy}
          markUnpaidBlocked={markUnpaidBlocked}
          markUnpaidBlockedReason={markUnpaidBlockedReason}
        />
      </div>

      {payUrl ? (
        <div className="mt-3 border-t border-pine/10 pt-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-clay">
            Online payment link
          </p>
          <CopyPayLinkButton payUrl={payUrl} />
        </div>
      ) : null}
    </div>
  );
}