import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReceivablesTable } from "@/components/receivables-table";
import { formatCurrency } from "@/lib/currency";
import {
  computeInvoiceAmounts,
  invoiceOutstandingCents,
  invoiceReference,
  outstandingCents
} from "@/lib/invoice-calculations";
import { supabase } from "@/lib/supabase";
import type {
  InvoiceData,
  InvoiceKind,
  ReceivableInvoice,
  ReceivableJob
} from "@/lib/types";

// Accounts Receivable: a read-only collections view over every accepted quote
// that has invoice setup. Reads live from Supabase (no caching) so freshly
// marked-paid invoices move a job from Pending Payments to Historical Paid on
// reload. No new tables — everything is derived from quotes.invoice_data.
export const dynamic = "force-dynamic";

type ReceivablesRow = {
  id: string;
  quote_id: string;
  client_name: string;
  project_type: string;
  status: string;
  invoice_data: InvoiceData | null;
  created_at: string;
};

// Flatten one quote row into a ReceivableJob. Returns null when the row has no
// usable invoice setup (missing invoice_data, no invoice records, or a $0
// total invoiced — e.g. an empty/unbalanced setup with nothing to collect).
function buildReceivableJob(row: ReceivablesRow): ReceivableJob | null {
  const data = row.invoice_data;
  if (!data || !Array.isArray(data.invoices) || data.invoices.length === 0) {
    return null;
  }

  const toReceivableInvoice = (kind: InvoiceKind): ReceivableInvoice | null => {
    const invoice = data.invoices.find((record) => record.kind === kind);
    if (!invoice) return null;
    return {
      kind,
      reference: invoiceReference(row.quote_id, kind),
      amountCents: Math.round(invoice.amountCents) || 0,
      status: invoice.status,
      outstandingCents: invoiceOutstandingCents(invoice),
      issuedAt: invoice.issuedAt ?? null,
      paidAt: invoice.paidAt ?? null
    };
  };

  const initial = toReceivableInvoice("initial");
  const finish = toReceivableInvoice("finish");

  const totalInvoicedCents = computeInvoiceAmounts(data).totalInvoicedCents;
  if (totalInvoicedCents <= 0) return null;

  const totalOutstandingCents = outstandingCents(data);

  const issuedDates = data.invoices
    .map((invoice) => invoice.issuedAt)
    .filter((value): value is string => Boolean(value));
  const earliestIssuedAt = issuedDates.length > 0
    ? issuedDates.sort()[0] ?? null
    : null;

  return {
    id: row.id,
    quoteId: row.quote_id,
    clientName: row.client_name || "Unnamed Client",
    projectType: row.project_type || "",
    initial,
    finish,
    totalInvoicedCents,
    totalPaidCents: totalInvoicedCents - totalOutstandingCents,
    totalOutstandingCents,
    earliestIssuedAt
  };
}

export default async function ReceivablesPage() {
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_id, client_name, project_type, status, invoice_data, created_at"
    )
    .eq("status", "accepted")
    .not("invoice_data", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <AppShell>
        <ReceivablesHeader />
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load receivables from the database. {error.message}
        </p>
      </AppShell>
    );
  }

  const rows = (data ?? []) as ReceivablesRow[];
  const jobs = rows
    .map(buildReceivableJob)
    .filter((job): job is ReceivableJob => Boolean(job));

  // Page-level totals across every job (independent of the client-side period
  // filter, which only narrows what is displayed, not the headline figures).
  const totalInvoiced = jobs.reduce(
    (sum, job) => sum + job.totalInvoicedCents,
    0
  );
  const totalOutstanding = jobs.reduce(
    (sum, job) => sum + job.totalOutstandingCents,
    0
  );
  const totalPaid = totalInvoiced - totalOutstanding;

  return (
    <AppShell>
      <ReceivablesHeader />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Invoiced" value={formatCurrency(totalInvoiced)} />
        <SummaryCard
          label="Total Outstanding"
          value={formatCurrency(totalOutstanding)}
          emphasize={totalOutstanding > 0}
        />
        <SummaryCard label="Total Paid" value={formatCurrency(totalPaid)} />
      </div>

      <ReceivablesTable jobs={jobs} />
    </AppShell>
  );
}

function ReceivablesHeader() {
  return (
    <div className="mb-8">
      <Link
        href="/"
        className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
      >
        Back to dashboard
      </Link>

      <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
        Accounts Receivable
      </p>

      <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
        Who owes what.
      </h1>

      <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
        Every invoiced job in one place. Pending Payments shows what is still
        outstanding; Historical Paid shows jobs that are paid in full. Filter by
        period and sort to chase down balances.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  emphasize
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "rounded-xl2 border border-clay/30 bg-clay/10 p-5 shadow-soft"
          : "rounded-xl2 border border-pine/10 bg-whitewarm/75 p-5 shadow-soft"
      }
    >
      <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
        {label}
      </p>
      <p
        className={
          emphasize
            ? "font-display text-3xl font-bold text-clay"
            : "font-display text-3xl font-bold text-deep-pine"
        }
      >
        {value}
      </p>
    </div>
  );
}