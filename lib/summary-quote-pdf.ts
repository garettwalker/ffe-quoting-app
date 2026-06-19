import { categoryDisplayName, summarizeByCategory } from "@/lib/calculations";
import { formatCurrency } from "@/lib/currency";
import { getLogoDataUri } from "@/lib/pdf-logo";
import { getSettings } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import type { QuoteCalculationResult, QuoteFormState } from "@/lib/types";
import type { SummaryQuotePdfProps } from "@/components/pdf/summary-quote-document";

// Server-only helper shared by the Summary Quote preview page
// (app/quotes/[id]/summary/page.tsx) and the PDF download route
// (app/quotes/[id]/summary/pdf/route.ts). Loads the saved quote snapshot + live
// settings, then builds the plain, pre-formatted props the react-pdf document
// needs — all money/date/locale formatting happens here so the PDF component
// stays pure data-in and the preview and downloaded PDF can never drift apart.
// Mirrors lib/detailed-quote-pdf.ts.

type SavedQuoteRow = {
  id: string;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult;
};

export type SummaryQuotePdfInput = {
  quote: QuoteFormState;
  result: QuoteCalculationResult;
  settings: Awaited<ReturnType<typeof getSettings>>;
  fullAddress: string;
  quoteDateLabel: string;
  pdfProps: SummaryQuotePdfProps;
  fileName: string;
};

// Returns null when the quote (or its snapshots) can't be loaded, so callers
// can render their own not-found UI.
export async function loadSummaryQuotePdfInput(
  id: string
): Promise<SummaryQuotePdfInput | null> {
  const [quoteResult, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_data, calculation_data")
      .eq("id", id)
      .single(),
    getSettings()
  ]);

  const { data, error } = quoteResult;
  if (error || !data || !data.quote_data || !data.calculation_data) return null;

  const row = data as SavedQuoteRow;
  const quote = row.quote_data;
  const result = row.calculation_data;

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const quoteDateLabel = formatQuoteDate(quote.quoteDate);
  const squareFootageLabel = `${quote.squareFootage.toLocaleString()} sq ft`;

  const pdfProps: SummaryQuotePdfProps = {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    quoteId: quote.quoteId,
    quoteDateLabel,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    fullAddress,
    projectType: quote.projectType,
    squareFootageLabel,
    categories: summarizeByCategory(result).map((entry) => ({
      label: categoryDisplayName(entry.category),
      amount: formatCurrency(entry.totalCents)
    })),
    quoteTotal: formatCurrency(result.clientQuoteTotalCents),
    quoteNotes: settings.defaultQuoteNotes,
    logoDataUri: getLogoDataUri()
  };

  return {
    quote,
    result,
    settings,
    fullAddress,
    quoteDateLabel,
    pdfProps,
    fileName: `summary-${quote.quoteId}.pdf`
  };
}

// Long-form date, e.g. "June 18, 2026". Matches the format used on the
// customer-facing printables.
function formatQuoteDate(value: string): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}