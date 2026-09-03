import { getSupabaseServer } from "@/lib/supabase-server";
import { getScheduleRange } from "@/lib/schedule-server";
import { outstandingCents, invoiceIsReceivable } from "@/lib/invoice-calculations";
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

  // 2. Batch load email receipts for aging and outstanding calc
  const receiptsById = await loadInvoiceReceipts(quotes.map((q) => q.id));

  // --- Money Calculations ---
  let outstandingTotal = 0;
  let paidInFullCount = 0;
  const aging = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyPlus: 0 };

  quotes.forEach((quote) => {
    const receipts = receiptsById.get(quote.id);
    const outstanding = outstandingCents(quote.invoice_data, receipts);

    if (outstanding > 0) {
      outstandingTotal += outstanding;

      // Determine aging bucket based on the oldest receivable invoice
      // Logic: find the earliest issued/sent date among unpaid receivable invoices
      let earliestDate: Date | null = null;

      if (quote.invoice_data?.scopeLines?.length || quote.invoice_data?.totalInvoicedCents) {
        // Check initial invoice (rough-in) - receivable on setup
        if (quote.invoice_data.generatedAt) {
          const genDate = new Date(quote.invoice_data.generatedAt);
          if (!earliestDate || genDate < earliestDate) earliestDate = genDate;
        }

        // Check finish/service invoices - receivable on email
        const quoteReceipts = receipts?.receipts ?? [];
        quoteReceipts.forEach((r) => {
          if (r.sent_at) {
            const sentDate = new Date(r.sent_at);
            if (!earliestDate || sentDate < earliestDate) earliestDate = sentDate;
          }
        });
      }

      if (earliestDate) {
        const diffDays = Math.floor((now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) aging.current += outstanding;
        else if (diffDays <= 60) aging.thirtyDays += outstanding;
        else if (diffDays <= 90) aging.sixtyDays += outstanding;
        else aging.ninetyPlus += outstanding;
      } else {
        // Fallback to current if no date found
        aging.current += outstanding;
      }
    }

    if (quote.invoice_data?.isPaidInFull) {
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
      q.status === "accepted" && (!q.invoice_data || (q.invoice_data as any).totalInvoicedCents <= 0)
    ).length,
    inProgress: quotes.filter((q) =>
      ["accepted", "scheduled"].includes(q.status || "") &&
      (q.invoice_data as any)?.totalInvoicedCents > 0 &&
      !(q.invoice_data as any)?.isPaidInFull
    ).length,
    paid: quotes.filter((q) =>
      ["accepted", "scheduled"].includes(q.status || "") &&
      (q.invoice_data as any)?.totalInvoicedCents > 0 &&
      (q.invoice_data as any)?.isPaidInFull
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
