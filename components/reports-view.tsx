"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatPercent } from "@/lib/currency";
import {
  EMPTY_FILTERS,
  computeReport,
  deltaPct,
  formatDelta,
  rangeLabel,
  type ReportCompare,
  type ReportDataset,
  type ReportFilters,
  type ReportGroup,
  type ReportRange
} from "@/lib/reports";
import {
  CHART_COLORS,
  FunnelBars,
  GroupedBarChart,
  HorizontalBars,
  MonthChangeChart,
  TrendLineChart
} from "@/components/reports/report-charts";
import type { QuoteType } from "@/lib/types";

type ReportView = "one" | "two" | "three";
type Measure = "invoiced" | "collected";

const RANGES: { value: ReportRange; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last_12", label: "Last 12 months" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" }
];

const GROUPS: { value: ReportGroup; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" }
];

const COMPARES: { value: ReportCompare; label: string }[] = [
  { value: "prior_year", label: "Prior year" },
  { value: "prior_quarter", label: "Prior quarter" },
  { value: "prior_month", label: "Prior month" },
  { value: "none", label: "No comparison" }
];

const QUOTE_TYPES: { value: QuoteType; label: string }[] = [
  { value: "new_build", label: "New build" },
  { value: "service_call", label: "Service call" },
  { value: "direct_invoice", label: "Direct invoice" }
];

const VIEW_COPY: Record<ReportView, { name: string; desc: string }> = {
  one: {
    name: "One screen",
    desc: "Filters, headline numbers, and comparisons on one page."
  },
  two: {
    name: "Compare first",
    desc: "This period against the one before, broken down by quarter and customer."
  },
  three: {
    name: "Report builder",
    desc: "Deep filters, saved views, and a chart or table view."
  }
};

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-clay">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring min-h-11 rounded-soft border border-pine/20 bg-whitewarm px-3 text-sm font-bold normal-case tracking-normal text-charcoal"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-pine px-3.5 py-2 text-xs font-black text-whitewarm shadow-card"
          : "rounded-full border border-pine/20 bg-whitewarm px-3.5 py-2 text-xs font-black text-deep-pine hover:bg-pine/10"
      }
    >
      {label}
    </button>
  );
}

function Delta({
  current,
  prior,
  invert = false
}: {
  current: number;
  prior: number;
  invert?: boolean;
}) {
  const change = deltaPct(current, prior);
  if (change == null) {
    return <span className="text-charcoal/50">no prior data</span>;
  }
  const positive = change >= 0;
  const good = invert ? !positive : positive;
  return (
    <span className={good ? "font-bold text-[#0f7a3d]" : "font-bold text-clay"}>
      {formatDelta(change)} vs prior
    </span>
  );
}

function Kpi({
  label,
  value,
  children
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl1 border border-pine/10 bg-whitewarm p-4">
      <p className="text-[10.5px] font-black uppercase tracking-[0.14em] text-clay">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums leading-tight text-deep-pine">
        {value}
      </p>
      {children ? (
        <p className="mt-1 text-xs text-charcoal/60">{children}</p>
      ) : null}
    </div>
  );
}

function Card({
  title,
  note,
  action,
  children
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl1 border border-pine/10 bg-whitewarm p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-deep-pine">{title}</h3>
        {action ?? (note ? <span className="text-xs text-charcoal/55">{note}</span> : null)}
      </div>
      {children}
    </section>
  );
}

export function ReportsView({ dataset }: { dataset: ReportDataset }) {
  const [view, setView] = useState<ReportView>("one");
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [measure, setMeasure] = useState<Measure>("invoiced");
  const [display, setDisplay] = useState<"chart" | "table">("chart");

  const report = useMemo(() => computeReport(dataset, filters), [dataset, filters]);

  const customers = useMemo(
    () =>
      Array.from(new Set(dataset.quotes.map((quote) => quote.customer))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [dataset]
  );
  const projectTypes = useMemo(
    () =>
      Array.from(new Set(dataset.quotes.map((quote) => quote.projectType))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [dataset]
  );

  const patch = (next: Partial<ReportFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  const toggleQuoteType = (type: QuoteType) => {
    const active =
      filters.quoteTypes.length === 0
        ? QUOTE_TYPES.map((option) => option.value)
        : filters.quoteTypes;
    const next = active.includes(type)
      ? active.filter((value) => value !== type)
      : [...active, type];
    patch({
      quoteTypes: next.length === QUOTE_TYPES.length ? [] : next
    });
  };

  const exportCsv = () => {
    const rows = [
      ["Period", "Invoiced", "Collected", "Quoted", "Outstanding"],
      ...report.grouped.map((bucket) => [
        bucket.label,
        (bucket.invoicedCents / 100).toFixed(2),
        (bucket.collectedCents / 100).toFixed(2),
        (bucket.quotedCents / 100).toFixed(2),
        (bucket.outstandingCents / 100).toFixed(2)
      ])
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ffe-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const rangeChips = (
    <div className="flex flex-wrap gap-2">
      {RANGES.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          active={filters.range === option.value}
          onClick={() => patch({ range: option.value })}
        />
      ))}
    </div>
  );

  const customDates =
    filters.range === "custom" ? (
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-clay">
          From
          <input
            type="date"
            value={filters.customFrom}
            onChange={(event) => patch({ customFrom: event.target.value })}
            className="focus-ring min-h-11 rounded-soft border border-pine/20 bg-whitewarm px-3 text-sm font-bold text-charcoal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-clay">
          To
          <input
            type="date"
            value={filters.customTo}
            onChange={(event) => patch({ customTo: event.target.value })}
            className="focus-ring min-h-11 rounded-soft border border-pine/20 bg-whitewarm px-3 text-sm font-bold text-charcoal"
          />
        </label>
      </div>
    ) : null;

  const customerOptions = [
    { value: "all", label: "All customers" },
    ...customers.map((name) => ({ value: name, label: name }))
  ];
  const projectTypeOptions = [
    { value: "all", label: "All job types" },
    ...projectTypes.map((name) => ({ value: name, label: name }))
  ];
  const singleQuoteType =
    filters.quoteTypes.length === 0 ? "all" : filters.quoteTypes[0];

  const commonFilters = (
    <div className="flex flex-col gap-3">
      {rangeChips}
      {customDates}
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Group by"
          value={filters.groupBy}
          onChange={(value) => patch({ groupBy: value as ReportGroup })}
          options={GROUPS}
        />
        <Select
          label="Compare to"
          value={filters.compare}
          onChange={(value) => patch({ compare: value as ReportCompare })}
          options={COMPARES}
        />
        <Select
          label="Customer"
          value={filters.customer}
          onChange={(value) => patch({ customer: value })}
          options={customerOptions}
        />
        <Select
          label="Job type"
          value={singleQuoteType}
          onChange={(value) =>
            patch({
              quoteTypes: value === "all" ? [] : [value as QuoteType]
            })
          }
          options={[
            { value: "all", label: "All job types" },
            ...QUOTE_TYPES.map((option) => ({
              value: option.value,
              label: option.label
            }))
          ]}
        />
      </div>
    </div>
  );

  const monthlySeries = [
    {
      name: "Invoiced",
      color: CHART_COLORS.invoiced,
      values: report.monthly.map((bucket) => bucket.invoicedCents)
    },
    {
      name: "Collected",
      color: CHART_COLORS.collected,
      values: report.monthly.map((bucket) => bucket.collectedCents)
    }
  ];

  const quarterlySeries = [
    {
      name: "This year",
      color: CHART_COLORS.invoiced,
      values: report.quarterly.map((bucket) => bucket.invoicedCents)
    },
    ...(filters.compare === "none"
      ? []
      : [
          {
            name: "Prior period",
            color: CHART_COLORS.prior,
            values: report.quarterlyPriorValues
          }
        ])
  ];

  const currentMeasureValues = report.monthly.map((bucket) =>
    measure === "invoiced" ? bucket.invoicedCents : bucket.collectedCents
  );
  const priorMeasureValues =
    measure === "invoiced"
      ? report.monthlyPriorValues
      : report.monthlyPriorCollectedValues;

  const reportHeading =
    view === "one"
      ? "Business performance"
      : view === "two"
        ? "This period against the last"
        : "Report builder";

  const reportSubtitle = `${rangeLabel(filters, report.window)} · ${
    filters.customer === "all" ? "all customers" : filters.customer
  } · ${
    filters.quoteTypes.length === 0
      ? "all job types"
      : filters.quoteTypes.map((type) => QUOTE_TYPES.find((option) => option.value === type)?.label ?? type).join(", ")
  }`;

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to dashboard
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Reports
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Where the money stands.
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Invoiced, collected, and outstanding, compared across months, quarters,
          and years. Every filter recalculates the headline numbers, the charts,
          and the tables together.
        </p>
      </div>

      {dataset.capped ? (
        <p className="mb-6 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
          This report reached its cap (500 quotes), so older jobs are not
          included and these totals may be undercounting. Raise the cap in
          lib/reports-server.ts to fix the count.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(VIEW_COPY) as ReportView[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-selected={view === key}
            className={
              view === key
                ? "rounded-full bg-pine px-4 py-2.5 text-sm font-black text-whitewarm shadow-card"
                : "rounded-full border border-pine/20 bg-whitewarm px-4 py-2.5 text-sm font-black text-deep-pine hover:bg-pine/10"
            }
          >
            {VIEW_COPY[key].name}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm font-bold text-charcoal/60">
        <span className="font-black text-deep-pine">
          {VIEW_COPY[view].name}
        </span>{" "}
        {VIEW_COPY[view].desc}
      </p>

      <div className="overflow-hidden rounded-xl2 border border-pine/10 bg-cream/60 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-pine/10 bg-whitewarm px-5 py-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-deep-pine">
              {reportHeading}
            </h2>
            <p className="mt-0.5 text-xs font-bold text-charcoal/60">
              {reportSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-full border border-pine/20 bg-whitewarm px-4 py-2 text-xs font-black text-deep-pine hover:bg-pine/10"
            >
              Export CSV
            </button>
          </div>
        </div>

        {view === "three" ? null : (
          <div className="border-b border-pine/10 bg-cream/70 px-5 py-4">
            {view === "two" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Select
                    label="Compare"
                    value={filters.compare}
                    onChange={(value) => patch({ compare: value as ReportCompare })}
                    options={COMPARES.filter((option) => option.value !== "none")}
                  />
                  <Select
                    label="Measure"
                    value={measure}
                    onChange={(value) => setMeasure(value as Measure)}
                    options={[
                      { value: "invoiced", label: "Invoiced" },
                      { value: "collected", label: "Collected" }
                    ]}
                  />
                  <Select
                    label="Customer"
                    value={filters.customer}
                    onChange={(value) => patch({ customer: value })}
                    options={customerOptions}
                  />
                  <Select
                    label="Job type"
                    value={singleQuoteType}
                    onChange={(value) =>
                      patch({
                        quoteTypes: value === "all" ? [] : [value as QuoteType]
                      })
                    }
                    options={[
                      { value: "all", label: "All job types" },
                      ...QUOTE_TYPES.map((option) => ({
                        value: option.value,
                        label: option.label
                      }))
                    ]}
                  />
                </div>
                {rangeChips}
                {customDates}
              </div>
            ) : (
              commonFilters
            )}
          </div>
        )}

        {view === "three" ? (
          <div className="grid min-h-[640px] md:grid-cols-[256px_minmax(0,1fr)]">
            <aside className="border-b border-pine/10 bg-whitewarm p-4 md:border-b-0 md:border-r">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-clay">
                    Date range
                  </p>
                  <select
                    value={filters.range}
                    onChange={(event) =>
                      patch({ range: event.target.value as ReportRange })
                    }
                    className="focus-ring min-h-10 w-full rounded-soft border border-pine/20 bg-whitewarm px-3 text-sm font-bold text-charcoal"
                  >
                    {RANGES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {customDates ? <div className="mt-2">{customDates}</div> : null}
                </div>

                <Select
                  label="Compare"
                  value={filters.compare}
                  onChange={(value) => patch({ compare: value as ReportCompare })}
                  options={COMPARES}
                />

                <Select
                  label="Group by"
                  value={filters.groupBy}
                  onChange={(value) => patch({ groupBy: value as ReportGroup })}
                  options={GROUPS}
                />

                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-clay">
                    Customers
                  </p>
                  <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto pr-1">
                    <label className="flex min-h-7 items-center gap-2 text-xs font-bold text-charcoal">
                      <input
                        type="checkbox"
                        checked={filters.customer === "all"}
                        onChange={() => patch({ customer: "all" })}
                        className="h-3.5 w-3.5 accent-pine"
                      />
                      All customers
                    </label>
                    {customers.map((name) => (
                      <label
                        key={name}
                        className="flex min-h-7 items-center gap-2 text-xs font-bold text-charcoal"
                      >
                        <input
                          type="checkbox"
                          checked={filters.customer === name}
                          onChange={() => patch({ customer: name })}
                          className="h-3.5 w-3.5 accent-pine"
                        />
                        <span className="truncate">{name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-clay">
                    Job type
                  </p>
                  {QUOTE_TYPES.map((option) => {
                    const checked =
                      filters.quoteTypes.length === 0 ||
                      filters.quoteTypes.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="flex min-h-7 items-center gap-2 text-xs font-bold text-charcoal"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleQuoteType(option.value)}
                          className="h-3.5 w-3.5 accent-pine"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>

                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-clay">
                    Saved views
                  </p>
                  <div className="flex flex-col gap-1">
                    {[
                      {
                        label: "Revenue by quarter",
                        apply: () =>
                          patch({
                            range: "ytd",
                            groupBy: "quarter",
                            compare: "prior_year",
                            customer: "all",
                            projectType: "all",
                            quoteTypes: []
                          })
                      },
                      {
                        label: "Collections this month",
                        apply: () =>
                          patch({
                            range: "this_month",
                            groupBy: "month",
                            compare: "prior_month"
                          })
                      },
                      {
                        label: "Camel City history",
                        apply: () =>
                          patch({
                            range: "all",
                            groupBy: "year",
                            compare: "none",
                            customer: customers.includes("Camel City Construction")
                              ? "Camel City Construction"
                              : "all"
                          })
                      },
                      {
                        label: "AR aging over 60",
                        apply: () =>
                          patch({
                            range: "all",
                            groupBy: "quarter",
                            compare: "none"
                          })
                      }
                    ].map((saved) => (
                      <button
                        key={saved.label}
                        type="button"
                        onClick={saved.apply}
                        className="rounded-soft border border-transparent px-2 py-1.5 text-left text-xs font-bold text-charcoal/70 hover:border-pine/10 hover:bg-cream"
                      >
                        {saved.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <div className="min-w-0 p-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-2xl font-bold text-deep-pine">
                    Revenue by {filters.groupBy}
                  </h3>
                  <p className="text-xs font-bold text-charcoal/55">
                    {reportSubtitle}
                  </p>
                </div>
                <div className="flex gap-1 rounded-full border border-pine/15 bg-whitewarm p-1">
                  <button
                    type="button"
                    onClick={() => setDisplay("chart")}
                    className={
                      display === "chart"
                        ? "rounded-full bg-pine px-3 py-1.5 text-xs font-black text-whitewarm"
                        : "rounded-full px-3 py-1.5 text-xs font-black text-charcoal/60"
                    }
                  >
                    Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplay("table")}
                    className={
                      display === "table"
                        ? "rounded-full bg-pine px-3 py-1.5 text-xs font-black text-whitewarm"
                        : "rounded-full px-3 py-1.5 text-xs font-black text-charcoal/60"
                    }
                  >
                    Table
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 rounded-soft border border-pine/10 bg-whitewarm px-4 py-3">
                {[
                  { label: "Invoiced", value: formatCurrency(report.totals.invoicedCents) },
                  { label: "Collected", value: formatCurrency(report.totals.collectedCents) },
                  { label: "Open", value: formatCurrency(report.totals.outstandingCents) },
                  { label: "Jobs", value: String(report.totals.jobCount) },
                  { label: "Avg invoice", value: formatCurrency(report.totals.avgInvoiceCents) }
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-[9.5px] font-black uppercase tracking-[0.12em] text-clay">
                      {stat.label}
                    </p>
                    <p className="font-display text-lg font-bold tabular-nums text-deep-pine">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {display === "chart" ? (
                <div className="space-y-3">
                  <Card
                    title={`${filters.groupBy === "quarter" ? "Quarterly" : filters.groupBy === "year" ? "Yearly" : "Monthly"} revenue`}
                    note="Dollars"
                  >
                    <GroupedBarChart
                      labels={report.grouped.map((bucket) => bucket.label)}
                      series={[
                        {
                          name: "Invoiced",
                          color: CHART_COLORS.invoiced,
                          values: report.grouped.map((bucket) => bucket.invoicedCents)
                        },
                        {
                          name: "Collected",
                          color: CHART_COLORS.collected,
                          values: report.grouped.map((bucket) => bucket.collectedCents)
                        },
                        ...(filters.compare === "none"
                          ? []
                          : [
                              {
                                name: "Prior period",
                                color: CHART_COLORS.prior,
                                values: report.groupedPriorValues
                              }
                            ])
                      ]}
                      ariaLabel="Revenue by selected period"
                    />
                  </Card>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <Card title="Month over month change" note="Invoiced">
                      <MonthChangeChart
                        labels={report.monthly.map((bucket) => bucket.label)}
                        changes={report.mom.map((item) => item.changePct)}
                      />
                    </Card>
                    <Card title="Receivables aging" note="Open invoices">
                      <HorizontalBars
                        items={report.aging.map((bucket) => ({
                          label: bucket.label,
                          cents: bucket.cents
                        }))}
                        colorFor={(index) => CHART_COLORS.ramp[index]}
                      />
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl1 border border-pine/10 bg-whitewarm">
                  <table className="responsive-table w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                        <th className="p-3">Quarter</th>
                        <th className="p-3 text-right">Invoiced</th>
                        <th className="p-3 text-right">Collected</th>
                        <th className="p-3 text-right">Outstanding</th>
                        <th className="p-3 text-right">Collected rate</th>
                        <th className="p-3 text-right">vs prior year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.quarterRows.map((row) => (
                        <tr key={row.key} className="border-b border-pine/10">
                          <td className="p-3 font-bold text-deep-pine">{row.label}</td>
                          <td className="p-3 text-right tabular-nums">
                            {formatCurrency(row.invoicedCents)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatCurrency(row.collectedCents)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatCurrency(row.outstandingCents)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatPercent(
                              row.invoicedCents > 0
                                ? row.collectedCents / row.invoicedCents
                                : 0
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            <Delta
                              current={row.invoicedCents}
                              prior={row.priorInvoicedCents}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Invoiced" value={formatCurrency(report.totals.invoicedCents)}>
                <Delta
                  current={report.totals.invoicedCents}
                  prior={report.priorTotals.invoicedCents}
                />
              </Kpi>
              <Kpi label="Collected" value={formatCurrency(report.totals.collectedCents)}>
                <Delta
                  current={report.totals.collectedCents}
                  prior={report.priorTotals.collectedCents}
                />
              </Kpi>
              <Kpi label="Outstanding" value={formatCurrency(report.totals.outstandingCents)}>
                <Delta
                  current={report.totals.outstandingCents}
                  prior={report.priorTotals.outstandingCents}
                  invert
                />
              </Kpi>
              <Kpi
                label={view === "two" ? "Average invoice" : "Collected rate"}
                value={
                  view === "two"
                    ? formatCurrency(report.totals.avgInvoiceCents)
                    : formatPercent(report.totals.collectedRate)
                }
              >
                {view === "two" ? (
                  <Delta
                    current={report.totals.avgInvoiceCents}
                    prior={report.priorTotals.avgInvoiceCents}
                  />
                ) : (
                  <Delta
                    current={report.totals.collectedRate}
                    prior={report.priorTotals.collectedRate}
                  />
                )}
              </Kpi>
            </div>

            {view === "one" ? (
              <>
                <div className="grid gap-3 lg:grid-cols-[1.55fr_minmax(0,1fr)]">
                  <Card title="Invoiced and collected by month" note="Dollars">
                    <GroupedBarChart
                      labels={report.monthly.map((bucket) => bucket.label)}
                      series={monthlySeries}
                      ariaLabel="Invoiced and collected by month"
                    />
                  </Card>
                  <Card title="Receivables aging" note="Open invoices">
                    <HorizontalBars
                      items={report.aging.map((bucket) => ({
                        label: bucket.label,
                        cents: bucket.cents
                      }))}
                      colorFor={(index) => CHART_COLORS.ramp[index]}
                    />
                  </Card>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <Card title="Quarter over quarter">
                    <GroupedBarChart
                      labels={report.quarterly.map((bucket) => bucket.label)}
                      series={quarterlySeries}
                      height={220}
                      ariaLabel="Quarter over quarter"
                    />
                  </Card>
                  <Card title="Top customers">
                    <HorizontalBars
                      items={report.customers.map((customer) => ({
                        label: customer.name,
                        cents: customer.currentCents
                      }))}
                      emptyCopy="No invoiced jobs in this period."
                    />
                  </Card>
                  <Card title="Quote to paid">
                    <FunnelBars items={report.funnel} />
                  </Card>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-[1.5fr_minmax(0,1fr)]">
                  <Card
                    title={`${measure === "invoiced" ? "Invoiced" : "Collected"} by month, this period against the prior`}
                    note="Dollars"
                  >
                    <TrendLineChart
                      labels={report.monthly.map((bucket) => bucket.label)}
                      current={currentMeasureValues}
                      prior={
                        filters.compare === "none" ? [] : priorMeasureValues
                      }
                      currentName="This period"
                      priorName="Prior period"
                      ariaLabel="This period against the prior period"
                    />
                  </Card>

                  <Card title="Quarter comparison" note="Invoiced">
                    <div className="overflow-x-auto">
                      <table className="responsive-table w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                            <th className="py-2 pr-3">Quarter</th>
                            <th className="py-2 pr-3 text-right">This</th>
                            <th className="py-2 pr-3 text-right">Prior</th>
                            <th className="py-2 text-right">Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.quarterRows.map((row) => (
                            <tr key={row.key} className="border-b border-pine/10">
                              <td className="py-2 pr-3 font-bold text-deep-pine">
                                {row.label}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {formatCurrency(row.invoicedCents)}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {formatCurrency(row.priorInvoicedCents)}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                <Delta
                                  current={row.invoicedCents}
                                  prior={row.priorInvoicedCents}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <Card title="Customer movement" note="Invoiced this period">
                    <div className="overflow-x-auto">
                      <table className="responsive-table w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                            <th className="py-2 pr-3">Customer</th>
                            <th className="py-2 pr-3 text-right">This</th>
                            <th className="py-2 pr-3 text-right">Prior</th>
                            <th className="py-2 text-right">Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.customers.map((customer) => (
                            <tr
                              key={customer.name}
                              className="border-b border-pine/10"
                            >
                              <td className="py-2 pr-3 font-bold text-deep-pine">
                                {customer.name}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {formatCurrency(customer.currentCents)}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {formatCurrency(customer.priorCents)}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                <Delta
                                  current={customer.currentCents}
                                  prior={customer.priorCents}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card title="Where the work came from" note="Share of invoiced">
                    <HorizontalBars
                      items={report.projectTypes.map((type) => ({
                        label: type.name,
                        cents: type.cents
                      }))}
                      emptyCopy="No invoiced jobs in this period."
                    />
                  </Card>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
