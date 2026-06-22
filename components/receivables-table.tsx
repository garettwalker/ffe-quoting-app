"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/currency";
import type { ReceivableJob } from "@/lib/types";
import { InvoicePaidBadge } from "@/components/status-badge";

type ReceivablesTableProps = {
  jobs: ReceivableJob[];
};

type Period = "all" | "month" | "30d" | "quarter" | "year";
type Sort = "oldest" | "largest" | "newest" | "client";

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" }
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "oldest", label: "Oldest invoice first" },
  { value: "largest", label: "Largest outstanding first" },
  { value: "newest", label: "Newest invoice first" },
  { value: "client", label: "Client name A–Z" }
];

// Compute the [from, to] timestamp window for a preset, in local time. Returns
// null for "all" (no filter). `to` is the exclusive upper bound of the period
// (e.g. first ms of next month) so today is always included.
function periodRange(period: Period): { from: number; to: number } | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "30d") {
    const from = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    return { from, to: now.getTime() };
  }
  const year = now.getFullYear();
  const month = now.getMonth();
  if (period === "month") {
    return {
      from: new Date(year, month, 1).getTime(),
      to: new Date(year, month + 1, 1).getTime()
    };
  }
  if (period === "quarter") {
    const quarterStartMonth = month - (month % 3);
    return {
      from: new Date(year, quarterStartMonth, 1).getTime(),
      to: new Date(year, quarterStartMonth + 3, 1).getTime()
    };
  }
  // year
  return {
    from: new Date(year, 0, 1).getTime(),
    to: new Date(year + 1, 0, 1).getTime()
  };
}

function sortJobs(list: ReceivableJob[], sort: Sort): ReceivableJob[] {
  const withIndex = list.map((job, index) => ({ job, index }));
  withIndex.sort((a, b) => {
    switch (sort) {
      case "largest":
        return b.job.totalOutstandingCents - a.job.totalOutstandingCents;
      case "client":
        return a.job.clientName
          .localeCompare(b.job.clientName, undefined, { sensitivity: "base" });
      case "newest": {
        const at = a.job.earliestIssuedAt
          ? new Date(a.job.earliestIssuedAt).getTime()
          : -Infinity;
        const bt = b.job.earliestIssuedAt
          ? new Date(b.job.earliestIssuedAt).getTime()
          : -Infinity;
        return bt - at;
      }
      case "oldest":
      default: {
        // Oldest first; jobs with no issued date sort last (treated as far future).
        const at = a.job.earliestIssuedAt
          ? new Date(a.job.earliestIssuedAt).getTime()
          : Infinity;
        const bt = b.job.earliestIssuedAt
          ? new Date(b.job.earliestIssuedAt).getTime()
          : Infinity;
        if (at === bt) return a.index - b.index;
        return at - bt;
      }
    }
  });
  return withIndex.map((entry) => entry.job);
}

export function ReceivablesTable({ jobs }: ReceivablesTableProps) {
  const [period, setPeriod] = useState<Period>("all");
  const [sort, setSort] = useState<Sort>("oldest");

  const { pending, historical, filteredInvoiced, filteredOutstanding } =
    useMemo(() => {
      const range = periodRange(period);

      const inPeriod = (job: ReceivableJob) => {
        if (!range) return true;
        if (!job.earliestIssuedAt) return false;
        const t = new Date(job.earliestIssuedAt).getTime();
        return t >= range.from && t < range.to;
      };

      const filtered = jobs.filter(inPeriod);

      const pending = sortJobs(
        filtered.filter((job) => job.totalOutstandingCents > 0),
        sort
      );
      const historical = sortJobs(
        filtered.filter(
          (job) =>
            job.totalOutstandingCents === 0 && job.totalInvoicedCents > 0
        ),
        sort
      );

      const filteredInvoiced = filtered.reduce(
        (sum, job) => sum + job.totalInvoicedCents,
        0
      );
      const filteredOutstanding = filtered.reduce(
        (sum, job) => sum + job.totalOutstandingCents,
        0
      );

      return { pending, historical, filteredInvoiced, filteredOutstanding };
    }, [jobs, period, sort]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={
                period === option.value
                  ? "rounded-full bg-pine px-4 py-2 text-sm font-black text-whitewarm shadow-card"
                  : "rounded-full border border-pine/20 bg-whitewarm px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine/10"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm font-black text-deep-pine">
          <span className="uppercase tracking-[0.12em] text-clay">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="focus-ring min-h-12 rounded-soft border border-pine/20 bg-whitewarm px-3 font-bold text-charcoal"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {period !== "all" ? (
        <p className="rounded-soft border border-pine/10 bg-cream px-4 py-3 text-sm font-bold text-charcoal/70">
          Showing {pending.length + historical.length} jobs first invoiced in
          this period. Outstanding in period:{" "}
          <span className="font-black text-clay">
            {formatCurrency(filteredOutstanding)}
          </span>{" "}
          of {formatCurrency(filteredInvoiced)} invoiced.
        </p>
      ) : null}

      <ReceivablesSection
        eyebrow="Pending Payments"
        title="Outstanding balances to chase down"
        description="Jobs that still owe money. Mark the last unpaid invoice paid to move a job to Historical Paid."
        jobs={pending}
        emptyCopy="No outstanding invoices in this period. Everything is paid up."
        count={pending.length}
        countTone="pending"
      />

      <ReceivablesSection
        eyebrow="Historical Paid"
        title="Paid in full"
        description="Jobs where every invoice has been paid."
        jobs={historical}
        emptyCopy="No fully-paid jobs in this period yet."
        count={historical.length}
        countTone="paid"
      />
    </div>
  );
}

function ReceivablesSection({
  eyebrow,
  title,
  description,
  jobs,
  emptyCopy,
  count,
  countTone
}: {
  eyebrow: string;
  title: string;
  description: string;
  jobs: ReceivableJob[];
  emptyCopy: string;
  count: number;
  countTone: "pending" | "paid";
}) {
  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
            {eyebrow}
          </p>
          <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
            {title}
          </h2>
          <p className="mt-1 text-sm font-bold text-charcoal/65">{description}</p>
        </div>
        <span
          className={
            countTone === "pending"
              ? "rounded-full bg-clay/15 px-3 py-1 text-xs font-black text-clay"
              : "rounded-full bg-sage/30 px-3 py-1 text-xs font-black text-deep-pine"
          }
        >
          {count}
        </span>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-xl1 border border-pine/10 bg-cream p-5 text-sm font-bold text-charcoal/60">
          {emptyCopy}
        </p>
      ) : (
        <div className="responsive-table-wrap">
          <table className="responsive-table w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                <th className="py-3 pr-4 font-black">Client</th>
                <th className="py-3 pr-4 font-black">Rough-In</th>
                <th className="py-3 pr-4 font-black">Finish</th>
                <th className="py-3 pr-4 font-black">Total Outstanding</th>
                <th className="py-3 pr-4 font-black">Invoiced</th>
                <th className="py-3 font-black">Open</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function JobRow({ job }: { job: ReceivableJob }) {
  return (
    <tr className="border-b border-pine/10 align-top">
      <td className="py-4 pr-4">
        <p className="font-black text-deep-pine">{job.clientName}</p>
        <Link
          href={`/quotes/${job.id}/invoices`}
          className="text-xs font-bold text-charcoal/70 underline decoration-clay/40 underline-offset-2 hover:text-deep-pine"
        >
          {job.quoteId}
        </Link>
        {job.projectType ? (
          <p className="text-xs font-bold text-charcoal/50">{job.projectType}</p>
        ) : null}
      </td>

      <td className="py-4 pr-4">
        <InvoiceCell invoice={job.initial} label="Rough-in" />
      </td>

      <td className="py-4 pr-4">
        <InvoiceCell invoice={job.finish} label="Finish" />
      </td>

      <td className="py-4 pr-4">
        <p
          className={
            job.totalOutstandingCents > 0
              ? "font-display text-lg font-bold text-clay"
              : "font-display text-lg font-bold text-deep-pine"
          }
        >
          {formatCurrency(job.totalOutstandingCents)}
        </p>
      </td>

      <td className="py-4 pr-4 text-sm font-bold text-charcoal/70">
        {formatDate(job.earliestIssuedAt) || "N/A"}
      </td>

      <td className="py-4">
        <Link
          href={`/quotes/${job.id}/invoices`}
          className="rounded-full border border-pine/20 px-4 py-2 text-xs font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          Open
        </Link>
      </td>
    </tr>
  );
}

function InvoiceCell({
  invoice,
  label
}: {
  invoice: ReceivableJob["initial"];
  label: string;
}) {
  if (!invoice) {
    return <span className="text-sm font-bold text-charcoal/40">N/A</span>;
  }

  return (
    <div className="min-w-[140px]">
      <p className="font-bold text-charcoal">{formatCurrency(invoice.amountCents)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <InvoicePaidBadge status={invoice.status} />
        {invoice.status === "unpaid" ? (
          <span className="text-xs font-black text-clay">
            {formatCurrency(invoice.outstandingCents)} owed
          </span>
        ) : (
          <span className="text-xs font-bold text-charcoal/55">
            paid {formatDate(invoice.paidAt) || ""}
          </span>
        )}
      </div>
      <p className="sr-only">{label}</p>
    </div>
  );
}