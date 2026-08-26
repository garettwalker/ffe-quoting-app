import { formatCurrency } from "@/lib/currency";
import { getLogoDataUri } from "@/lib/pdf-logo";
import { getSettings } from "@/lib/pricing";
import { getSupabaseServer } from "@/lib/supabase-server";
import { normalizeQuoteType } from "@/lib/types";
import type {
  QuoteFormState,
  QuoteType,
  ServiceQuoteCalculationResult
} from "@/lib/types";
import type { ServiceQuotePdfProps } from "@/components/pdf/service-quote-document";

// Server-only helper shared by the service-call quote preview page
// (app/quotes/[id]/print/page.tsx) and the PDF download route
// (app/quotes/[id]/print/pdf/route.tsx). Loads the saved service quote snapshot
// + live settings, then builds the plain, pre-formatted props the react-pdf
// document needs — all money/date/locale formatting happens here so the PDF
// component stays pure data-in and the preview and downloaded PDF can never
// drift apart. Mirrors lib/detailed-quote-pdf.ts for new builds.

type SavedQuoteRow = {
  id: string;
  quote_type: string | null;
  quote_data: QuoteFormState;
  calculation_data: ServiceQuoteCalculationResult;
};

export type ServiceQuotePdfInput = {
  quote: QuoteFormState;
  result: ServiceQuoteCalculationResult;
  settings: Awaited<ReturnType<typeof getSettings>>;
  fullAddress: string;
  quoteDateLabel: string;
  pdfProps: ServiceQuotePdfProps;
  fileName: string;
};

// Returns null when the quote (or its snapshots) can't be loaded OR when the
// quote is not a service call, so the route handler can fall through to the
// new-build detailed-quote loader. Callers that already know the type can use
// loadServiceQuotePdfInputUnchecked below.
export async function loadServiceQuotePdfInput(
  id: string
): Promise<ServiceQuotePdfInput | null> {
  const supabase = getSupabaseServer();
  const [quoteResult, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_type, quote_data, calculation_data")
      .eq("id", id)
      .single(),
    getSettings()
  ]);

  const { data, error } = quoteResult;
  if (error || !data || !data.quote_data || !data.calculation_data) return null;

  const quoteType = normalizeQuoteType(data.quote_type);
  if (quoteType !== "service_call") return null;

  const row = data as SavedQuoteRow;
  const quote = row.quote_data;
  const result = row.calculation_data;

  return buildServiceQuotePdfInput(quote, result, settings);
}

// Build the pre-formatted props from already-loaded data (no DB read). Used by
// loadServiceQuotePdfInput and available for callers that already have the row.
function buildServiceQuotePdfInput(
  quote: QuoteFormState,
  result: ServiceQuoteCalculationResult,
  settings: Awaited<ReturnType<typeof getSettings>>
): ServiceQuotePdfInput {
  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const quoteDateLabel = formatQuoteDate(quote.quoteDate);

  const pdfProps: ServiceQuotePdfProps = {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    quoteId: quote.quoteId,
    quoteDateLabel,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    clientPhone: quote.clientPhone ?? "",
    projectName: quote.projectName ?? "",
    fullAddress,
    projectType: quote.projectType,
    lines: result.lines.map((line) => ({
      name: line.name,
      comment: line.comment ?? "",
      quantityLabel: line.quantity.toLocaleString(),
      amount: formatCurrency(line.amountCents)
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
    fileName: `quote-${quote.quoteId}.pdf`
  };
}

// Fetch only the quote_type for a quote row. Used by route handlers to dispatch
// between the new-build and service PDF loaders before loading the full row.
// Returns "new_build" for missing/unknown values (the existing default).
export async function fetchQuoteType(id: string): Promise<QuoteType> {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("quotes")
    .select("quote_type")
    .eq("id", id)
    .single();
  return normalizeQuoteType((data as { quote_type: string | null } | null)?.quote_type);
}

// Long-form date, e.g. "June 18, 2026". Matches the format used on the
// customer-facing printables (detailed-quote-pdf.ts).
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