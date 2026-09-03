import { getSupabaseServer } from "@/lib/supabase-server";
import { getScheduleRange } from "@/lib/schedule-server";
import { outstandingCents, invoiceIsReceivable, computeInvoiceAmounts, isPaidInFull } from "@/lib/invoice-calculations";
import { loadInvoiceReceipts } from "@/lib/email-log";
import { formatCurrency } from "@/lib/currency";
import type { DashboardQuoteRow } from "@/lib/types";

export type MoneyStats = {
  outstandingTotalCents: number;
  collectedThisMonthCents: number;
  paidInFullCount: number;
  aging: {
    current: number; // 0-30 days
    thirtyDays: number; // 31-60
    sixtyDays: number; // 61-90
    ninetyPlus: number; // 91+
  };
};

export type FunnelStats = {
  quotesOut: number;
  accepted: number;
  inProgress: number;
  paid: number;
};

export type DashboardStats = {
  money: MoneyStats;
  funnel: FunnelStats;
  week: any[]; // Simplified schedule assignments
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getSupabaseServer();
  const now = new Date();

  // 1. Fetch quotes and payments
  const [quotesResult, paymentsResult] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, invoice_data, created_at"),
    supabase
      .from("payments")
      .select("amount_cents, paid_at")
      .eq("status", "succeeded"),
  ]);

  const quotes = (quotesResult.data ?? []) as DashboardQuoteRow[];
  const payments = paymentsResult.data ?? [];

  // 2. Batch load email receipts for aging and outstanding calc. A missing key
  // means "never emailed" (all kinds null) — never pass undefined, which flips
  // the calc functions into legacy full-contract semantics.
  const receiptsById = await loadInvoiceReceipts(quotes.map((q) => q.id));
  const neverEmailed = { initial: null, finish: null, service: null } as const;

  // --- Money Calculations ---
  let outstandingTotal = 0;
  let paidInFullCount = 0;
  const aging: MoneyStats["aging"] = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyPlus: 0 };

  quotes.forEach((quote) => {
    const receipts = receiptsById.get(quote.id) ?? neverEmailed;
    const outstanding = outstandingCents(quote.invoice_data, receipts);

    if (outstanding > 0) {
      outstandingTotal += outstanding;

      // Aging bucket is set by the OLDEST unpaid receivable invoice. The
      // initial (rough-in) invoice is receivable from setup (issuedAt, falling
      // back to the setup timestamp); a finish/service invoice only once
      // emailed. Paid invoices are not part of the outstanding balance so
      // they never age.
      const receivableDates: number[] = [];

      if (quote.invoice_data) {
        for (const invoice of quote.invoice_data.invoices) {
          if (invoice.status !== "unpaid") continue;
          if (!invoiceIsReceivable(invoice, invoice.kind, receipts)) continue;

          if (invoice.kind === "initial") {
            const issuedAt = invoice.issuedAt ?? quote.invoice_data.generatedAt;
            receivableDates.push(new Date(issuedAt).getTime());
          } else {
            // finish / service: receivable from the invoice email
            const sentAt = invoice.kind === "finish" ? receipts.finish : receipts.service;
            if (sentAt) receivableDates.push(new Date(sentAt).getTime());
          }
        }
      }

      if (receivableDates.length > 0) {
        const oldest = Math.min(...receivableDates);
        const diffDays = Math.floor((now.getTime() - oldest) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) aging.current += outstanding;
        else if (diffDays <= 60) aging.thirtyDays += outstanding;
        else if (diffDays <= 90) aging.sixtyDays += outstanding;
        else aging.ninetyPlus += outstanding;
      } else {
        aging.current += outstanding;
      }
    }

    if (isPaidInFull(quote.invoice_data, receipts)) {
      paidInFullCount++;
    }
  });

  // Collected this month
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const collectedThisMonth = payments
    .filter((p) => p.paid_at && new Date(p.paid_at) >= firstOfMonth)
    .reduce((sum, p) => sum + p.amount_cents, 0);

  // --- Funnel Calculations ---
  const funnel = {
    quotesOut: quotes.filter((q) => ["draft", "prepared"].includes(q.status || "")).length,
    accepted: quotes.filter((q) =>
      q.status === "accepted" && (!q.invoice_data || computeInvoiceAmounts(q.invoice_data!).totalInvoicedCents <= 0)
    ).length,
    inProgress: quotes.filter((q) =>
      ["accepted", "scheduled"].includes(q.status || "") &&
      q.invoice_data && computeInvoiceAmounts(q.invoice_data).totalInvoicedCents > 0 &&
      !isPaidInFull(q.invoice_data, receiptsById.get(q.id) ?? neverEmailed)
    ).length,
    paid: quotes.filter((q) =>
      ["accepted", "scheduled"].includes(q.status || "") &&
      q.invoice_data && computeInvoiceAmounts(q.invoice_data).totalInvoicedCents > 0 &&
      isPaidInFull(q.invoice_data, receiptsById.get(q.id) ?? neverEmailed)
    ).length,
  };

  // --- Week Summary ---
  // Calculate current week range (Mon-Sun)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const week = await getScheduleRange(monday.toISOString(), sunday.toISOString());

  return {
    money: {
      outstandingTotalCents: outstandingTotal,
      collectedThisMonthCents: collectedThisMonth,
      paidInFullCount,
      aging,
    },
    funnel,
    week,
  };
}
