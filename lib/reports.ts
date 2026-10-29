// Reporting model, shared by the server loader and the client report views.
// Client-safe: no Supabase imports. The server loader builds a flat dataset of
// quotes, receivable invoices, and settled payments; every filter and total is
// recomputed here so the headline numbers and the charts always agree.

import type { InvoiceKind, QuoteType } from "@/lib/types";

export type ReportRange =
  | "this_month"
  | "this_quarter"
  | "ytd"
  | "last_12"
  | "all"
  | "custom";

export type ReportGroup = "month" | "quarter" | "year";

export type ReportCompare =
  | "none"
  | "prior_year"
  | "prior_quarter"
  | "prior_month";

export type ReportQuote = {
  quoteId: string;
  customer: string;
  projectType: string;
  quoteType: QuoteType;
  status: string;
  quotedCents: number;
  createdAt: string;
};

export type ReportInvoice = {
  quoteId: string;
  customer: string;
  projectType: string;
  quoteType: QuoteType;
  kind: InvoiceKind;
  amountCents: number;
  paidCents: number;
  outstandingCents: number;
  receivableAt: string;
};

export type ReportPayment = {
  quoteId: string;
  amountCents: number;
  paidAt: string;
  method: string;
};

export type ReportDataset = {
  quotes: ReportQuote[];
  invoices: ReportInvoice[];
  payments: ReportPayment[];
  capped: boolean;
  generatedAt: string;
};

export type ReportFilters = {
  range: ReportRange;
  customFrom: string;
  customTo: string;
  groupBy: ReportGroup;
  compare: ReportCompare;
  customer: string;
  projectType: string;
  quoteTypes: QuoteType[];
};

export type ReportBucket = {
  key: string;
  label: string;
  invoicedCents: number;
  collectedCents: number;
  quotedCents: number;
  outstandingCents: number;
};

export type ReportTotals = {
  invoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  quotedCents: number;
  acceptedCents: number;
  collectedRate: number;
  avgInvoiceCents: number;
  invoiceCount: number;
  jobCount: number;
};

export type ReportQuarterRow = {
  key: string;
  label: string;
  invoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  priorInvoicedCents: number;
};

export type ReportComputed = {
  window: { from: number; to: number } | null;
  priorWindow: { from: number; to: number } | null;
  totals: ReportTotals;
  priorTotals: ReportTotals;
  monthly: ReportBucket[];
  monthlyPriorValues: number[];
  monthlyPriorCollectedValues: number[];
  quarterly: ReportBucket[];
  quarterlyPriorValues: number[];
  quarterlyPriorCollectedValues: number[];
  grouped: ReportBucket[];
  groupedPriorValues: number[];
  customers: { name: string; currentCents: number; priorCents: number }[];
  projectTypes: { name: string; cents: number }[];
  aging: { label: string; cents: number }[];
  funnel: { label: string; cents: number }[];
  quarterRows: ReportQuarterRow[];
  mom: { label: string; changePct: number }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Quote types that should count as a real job in the pipeline. Drafts are
// included in Quoted (they are live estimates) but not in Accepted.
const ACCEPTED_STATUSES = new Set(["accepted", "scheduled"]);

export const EMPTY_FILTERS: ReportFilters = {
  range: "ytd",
  customFrom: "",
  customTo: "",
  groupBy: "month",
  compare: "prior_year",
  customer: "all",
  projectType: "all",
  quoteTypes: []
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function addMonths(date: Date, months: number): Date {
  // Preserve the day and time (used to shift a comparison window), clamping
  // the day when the target month is shorter.
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

function addYears(date: Date, years: number): Date {
  return new Date(
    date.getFullYear() + years,
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  // A date-only string ("2026-10-21") parsed by new Date() is UTC midnight,
  // which is the previous day (and sometimes the previous month) in US time
  // zones. Noon local keeps the calendar day for invoices and payments alike.
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + "T12:00:00").getTime()
    : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function parseCalendarDate(value: string): number | null {
  return parseDate(value);
}

export function reportWindow(
  filters: Pick<ReportFilters, "range" | "customFrom" | "customTo">,
  now: Date
): { from: number; to: number } | null {
  const today = new Date(now);
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (filters.range) {
    case "this_month":
      return {
        from: new Date(year, month, 1).getTime(),
        to: today.getTime()
      };
    case "this_quarter": {
      const quarterStart = month - (month % 3);
      return {
        from: new Date(year, quarterStart, 1).getTime(),
        to: today.getTime()
      };
    }
    case "ytd":
      return {
        from: new Date(year, 0, 1).getTime(),
        to: today.getTime()
      };
    case "last_12": {
      const from = new Date(year, month - 11, 1).getTime();
      return { from, to: today.getTime() };
    }
    case "custom": {
      const from = filters.customFrom
        ? parseCalendarDate(filters.customFrom)
        : null;
      const to = filters.customTo
        ? endOfDay(new Date(filters.customTo + "T12:00:00")).getTime()
        : null;
      if (from == null || to == null || to < from) return null;
      return { from, to };
    }
    case "all":
    default:
      return null;
  }
}

export function priorWindow(
  window: { from: number; to: number } | null,
  compare: ReportCompare
): { from: number; to: number } | null {
  if (!window || compare === "none") return null;
  const fromDate = new Date(window.from);
  const toDate = new Date(window.to);
  if (compare === "prior_year") {
    return { from: addYears(fromDate, -1).getTime(), to: addYears(toDate, -1).getTime() };
  }
  if (compare === "prior_quarter") {
    return { from: addMonths(fromDate, -3).getTime(), to: addMonths(toDate, -3).getTime() };
  }
  return { from: addMonths(fromDate, -1).getTime(), to: addMonths(toDate, -1).getTime() };
}

function inWindow(time: number | null, window: { from: number; to: number } | null): boolean {
  if (time == null) return false;
  if (!window) return true;
  return time >= window.from && time <= window.to;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function quarterOf(monthIndex: number): number {
  return Math.floor(monthIndex / 3) + 1;
}

function bucketKey(time: number, group: ReportGroup): string {
  const date = new Date(time);
  const year = date.getFullYear();
  if (group === "year") return String(year);
  if (group === "quarter") return `${year}-Q${quarterOf(date.getMonth())}`;
  return `${year}-${pad(date.getMonth() + 1)}`;
}

function bucketLabel(key: string, group: ReportGroup, showYear: boolean): string {
  if (group === "year") return key;
  if (group === "quarter") {
    const [year, quarter] = key.split("-");
    return showYear ? `${quarter} ${year}` : quarter;
  }
  const [year, month] = key.split("-");
  const name = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "short" }
  );
  return showYear ? `${name} ${year.slice(2)}` : name;
}

function enumerateBuckets(
  from: number,
  to: number,
  group: ReportGroup
): { key: string; label: string }[] {
  const start = new Date(from);
  const end = new Date(to);
  const keys: string[] = [];
  if (group === "year") {
    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      keys.push(String(year));
    }
  } else if (group === "quarter") {
    let year = start.getFullYear();
    let quarter = quarterOf(start.getMonth());
    while (year < end.getFullYear() || (year === end.getFullYear() && quarter <= quarterOf(end.getMonth()))) {
      keys.push(`${year}-Q${quarter}`);
      quarter += 1;
      if (quarter > 4) {
        quarter = 1;
        year += 1;
      }
      if (keys.length > 40) break;
    }
  } else {
    let year = start.getFullYear();
    let month = start.getMonth();
    while (year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth())) {
      keys.push(`${year}-${pad(month + 1)}`);
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      if (keys.length > 40) break;
    }
  }
  const spansYears = start.getFullYear() !== end.getFullYear();
  return keys.map((key) => ({ key, label: bucketLabel(key, group, spansYears) }));
}

function emptyTotals(): ReportTotals {
  return {
    invoicedCents: 0,
    collectedCents: 0,
    outstandingCents: 0,
    quotedCents: 0,
    acceptedCents: 0,
    collectedRate: 0,
    avgInvoiceCents: 0,
    invoiceCount: 0,
    jobCount: 0
  };
}

function finishTotals(totals: ReportTotals): ReportTotals {
  return {
    ...totals,
    collectedRate:
      totals.invoicedCents > 0
        ? totals.collectedCents / totals.invoicedCents
        : 0,
    avgInvoiceCents:
      totals.invoiceCount > 0
        ? totals.invoicedCents / totals.invoiceCount
        : 0
  };
}

function earliestEventTime(dataset: ReportDataset): number {
  const times = [
    ...dataset.quotes.map((quote) => parseCalendarDate(quote.createdAt)),
    ...dataset.invoices.map((invoice) => parseDate(invoice.receivableAt)),
    ...dataset.payments.map((payment) => parseDate(payment.paidAt))
  ].filter((time): time is number => time != null);
  return times.length > 0 ? Math.min(...times) : Date.now();
}

export function computeReport(
  dataset: ReportDataset,
  filters: ReportFilters,
  now: Date = new Date()
): ReportComputed {
  const window = reportWindow(filters, now);
  const prior = priorWindow(window, filters.compare);
  const nowTime = now.getTime();

  const quotePasses = (quote: ReportQuote): boolean => {
    if (filters.customer !== "all" && quote.customer !== filters.customer) {
      return false;
    }
    if (filters.projectType !== "all" && quote.projectType !== filters.projectType) {
      return false;
    }
    if (
      filters.quoteTypes.length > 0 &&
      !filters.quoteTypes.includes(quote.quoteType)
    ) {
      return false;
    }
    return true;
  };

  const invoicePasses = (invoice: ReportInvoice): boolean => {
    if (filters.customer !== "all" && invoice.customer !== filters.customer) {
      return false;
    }
    if (
      filters.projectType !== "all" &&
      invoice.projectType !== filters.projectType
    ) {
      return false;
    }
    if (
      filters.quoteTypes.length > 0 &&
      !filters.quoteTypes.includes(invoice.quoteType)
    ) {
      return false;
    }
    return true;
  };

  const allowedQuoteIds = new Set(
    dataset.quotes.filter(quotePasses).map((quote) => quote.quoteId)
  );

  const invoices = dataset.invoices.filter(invoicePasses);
  const payments = dataset.payments.filter((payment) =>
    allowedQuoteIds.has(payment.quoteId)
  );
  const quotes = dataset.quotes.filter(quotePasses);

  const totalsFor = (target: { from: number; to: number } | null): ReportTotals => {
    const totals = emptyTotals();
    const jobs = new Set<string>();
    for (const invoice of invoices) {
      if (!inWindow(parseDate(invoice.receivableAt), target)) continue;
      totals.invoicedCents += invoice.amountCents;
      totals.outstandingCents += invoice.outstandingCents;
      totals.invoiceCount += 1;
      jobs.add(invoice.quoteId);
    }
    for (const payment of payments) {
      if (!inWindow(parseDate(payment.paidAt), target)) continue;
      totals.collectedCents += payment.amountCents;
    }
    for (const quote of quotes) {
      if (!inWindow(parseCalendarDate(quote.createdAt), target)) continue;
      totals.quotedCents += quote.quotedCents;
      if (ACCEPTED_STATUSES.has(quote.status)) {
        totals.acceptedCents += quote.quotedCents;
      }
    }
    totals.jobCount = jobs.size;
    return finishTotals(totals);
  };

  const buildBuckets = (
    target: { from: number; to: number } | null,
    group: ReportGroup
  ): ReportBucket[] => {
    let range = target;
    if (!range) {
      const from = earliestEventTime(dataset);
      range = { from, to: nowTime };
    }
    const buckets = enumerateBuckets(range.from, range.to, group).map((bucket) => ({
      ...bucket,
      invoicedCents: 0,
      collectedCents: 0,
      quotedCents: 0,
      outstandingCents: 0
    }));
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    for (const invoice of invoices) {
      const time = parseDate(invoice.receivableAt);
      if (!inWindow(time, range) || time == null) continue;
      const bucket = byKey.get(bucketKey(time, group));
      if (!bucket) continue;
      bucket.invoicedCents += invoice.amountCents;
      bucket.outstandingCents += invoice.outstandingCents;
    }
    for (const payment of payments) {
      const time = parseDate(payment.paidAt);
      if (!inWindow(time, range) || time == null) continue;
      const bucket = byKey.get(bucketKey(time, group));
      if (!bucket) continue;
      bucket.collectedCents += payment.amountCents;
    }
    for (const quote of quotes) {
      const time = parseCalendarDate(quote.createdAt);
      if (!inWindow(time, range) || time == null) continue;
      const bucket = byKey.get(bucketKey(time, group));
      if (!bucket) continue;
      bucket.quotedCents += quote.quotedCents;
    }
    return buckets;
  };

  const totals = totalsFor(window);
  const priorTotals = prior ? totalsFor(prior) : emptyTotals();

  const monthly = buildBuckets(window, "month");
  const monthlyPrior = prior ? buildBuckets(prior, "month") : [];
  const quarterly = buildBuckets(window, "quarter");
  const quarterlyPrior = prior ? buildBuckets(prior, "quarter") : [];
  const grouped = buildBuckets(window, filters.groupBy);
  const groupedPrior = prior ? buildBuckets(prior, filters.groupBy) : [];

  const align = (current: ReportBucket[], previous: ReportBucket[]): number[] =>
    current.map((_, index) => previous[index]?.invoicedCents ?? 0);

  const alignCollected = (
    current: ReportBucket[],
    previous: ReportBucket[]
  ): number[] =>
    current.map((_, index) => previous[index]?.collectedCents ?? 0);

  const monthlyPriorValues = align(monthly, monthlyPrior);
  const monthlyPriorCollectedValues = alignCollected(monthly, monthlyPrior);
  const quarterlyPriorValues = align(quarterly, quarterlyPrior);
  const quarterlyPriorCollectedValues = alignCollected(quarterly, quarterlyPrior);
  const groupedPriorValues = align(grouped, groupedPrior);

  // Customer movement. Current and prior invoiced, top six by current, with
  // everything else folded into Other so the list never grows unbounded.
  const customerCurrent = new Map<string, number>();
  const customerPrior = new Map<string, number>();
  for (const invoice of invoices) {
    const time = parseDate(invoice.receivableAt);
    if (inWindow(time, window)) {
      customerCurrent.set(
        invoice.customer,
        (customerCurrent.get(invoice.customer) ?? 0) + invoice.amountCents
      );
    }
    if (prior && inWindow(time, prior)) {
      customerPrior.set(
        invoice.customer,
        (customerPrior.get(invoice.customer) ?? 0) + invoice.amountCents
      );
    }
  }
  const sortedCustomers = Array.from(customerCurrent.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const topCustomers = sortedCustomers.slice(0, 6);
  const otherCurrent = sortedCustomers
    .slice(6)
    .reduce((sum, [, cents]) => sum + cents, 0);
  const otherPrior = Array.from(customerPrior.entries())
    .filter(([name]) => !topCustomers.some(([topName]) => topName === name))
    .reduce((sum, [, cents]) => sum + cents, 0);
  const customers = topCustomers.map(([name, currentCents]) => ({
    name,
    currentCents,
    priorCents: customerPrior.get(name) ?? 0
  }));
  if (otherCurrent > 0 || otherPrior > 0) {
    customers.push({
      name: "Other",
      currentCents: otherCurrent,
      priorCents: otherPrior
    });
  }

  // Project type mix.
  const typeMap = new Map<string, number>();
  for (const invoice of invoices) {
    if (!inWindow(parseDate(invoice.receivableAt), window)) continue;
    typeMap.set(
      invoice.projectType,
      (typeMap.get(invoice.projectType) ?? 0) + invoice.amountCents
    );
  }
  const projectTypes = Array.from(typeMap.entries())
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents);

  // AR aging on the invoices that are still open in the selected window.
  const agingBuckets = [
    { label: "0-30 days", cents: 0 },
    { label: "31-60 days", cents: 0 },
    { label: "61-90 days", cents: 0 },
    { label: "91-120 days", cents: 0 },
    { label: "120+ days", cents: 0 }
  ];
  for (const invoice of invoices) {
    if (invoice.outstandingCents <= 0) continue;
    const time = parseDate(invoice.receivableAt);
    if (!inWindow(time, window) || time == null) continue;
    const days = Math.max(0, Math.floor((nowTime - time) / DAY_MS));
    const index =
      days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : days <= 120 ? 3 : 4;
    agingBuckets[index].cents += invoice.outstandingCents;
  }

  const funnel = [
    { label: "Quoted", cents: totals.quotedCents },
    { label: "Accepted", cents: totals.acceptedCents },
    { label: "Invoiced", cents: totals.invoicedCents },
    { label: "Paid", cents: totals.collectedCents }
  ];

  // Quarter table. Prior column is always the same quarter a year earlier,
  // which is the comparison a contractor actually wants on this table.
  const invoicedByQuarter = new Map<string, number>();
  for (const invoice of invoices) {
    const time = parseDate(invoice.receivableAt);
    if (time == null) continue;
    const key = bucketKey(time, "quarter");
    invoicedByQuarter.set(
      key,
      (invoicedByQuarter.get(key) ?? 0) + invoice.amountCents
    );
  }
  const quarterRows: ReportQuarterRow[] = quarterly.map((bucket) => {
    const [year, quarter] = bucket.key.split("-");
    const priorKey = `${Number(year) - 1}-${quarter}`;
    return {
      key: bucket.key,
      label: bucket.key.replace("-", " "),
      invoicedCents: bucket.invoicedCents,
      collectedCents: bucket.collectedCents,
      outstandingCents: bucket.outstandingCents,
      priorInvoicedCents: invoicedByQuarter.get(priorKey) ?? 0
    };
  });

  // Month over month change on invoiced.
  const mom = monthly.map((bucket, index) => {
    if (index === 0) return { label: bucket.label, changePct: 0 };
    const previous = monthly[index - 1].invoicedCents;
    return {
      label: bucket.label,
      changePct:
        previous > 0
          ? ((bucket.invoicedCents - previous) / previous) * 100
          : 0
    };
  });

  return {
    window,
    priorWindow: prior,
    totals,
    priorTotals,
    monthly,
    monthlyPriorValues,
    monthlyPriorCollectedValues,
    quarterly,
    quarterlyPriorValues,
    quarterlyPriorCollectedValues,
    grouped,
    groupedPriorValues,
    customers,
    projectTypes,
    aging: agingBuckets,
    funnel,
    quarterRows,
    mom
  };
}

export function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export function formatCompactCurrency(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${(dollars / 1_000).toFixed(1)}k`;
  }
  return `$${Math.round(dollars)}`;
}

export function formatDelta(value: number | null): string {
  if (value == null) return "new";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function rangeLabel(
  filters: ReportFilters,
  window: { from: number; to: number } | null
): string {
  if (!window) return "All time";
  const format = (time: number) =>
    new Date(time).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  return `${format(window.from)} to ${format(window.to)}`;
}
