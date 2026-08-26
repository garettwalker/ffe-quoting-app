import { formatCurrency } from "@/lib/currency";
import {
  findInvoice,
  invoiceDisplayNumber
} from "@/lib/invoice-calculations";
import { getLogoDataUri } from "@/lib/pdf-logo";
import { getSettings } from "@/lib/pricing";
import { getSupabaseServer } from "@/lib/supabase-server";
import { normalizeQuoteType } from "@/lib/types";
import type {
  InvoiceData,
  QuoteFormState,
  ServiceQuoteCalculationResult
} from "@/lib/types";
import type { ServiceInvoicePdfProps } from "@/components/pdf/service-invoice-document";

// Server-only helper shared by the printable service-invoice preview page
// (app/quotes/[id]/invoices/[kind]/print/page.tsx, kind === "service") and the
// PDF download route (app/quotes/[id]/invoices/[kind]/pdf/route.tsx). Loads the
// saved service quote row + invoice setup + live settings, resolves the single
// "service" invoice record, and builds the plain, pre-formatted props the
// react-pdf document needs — all money/date/locale formatting happens here so
// the PDF component stays pure data-in and the preview and downloaded PDF can
// never drift apart. Mirrors lib/invoice-pdf.ts for new builds.

type ServiceInvoiceRow = {
  id: string;
  quote_id: string;
  quote_type: string | null;
  quote_data: QuoteFormState;
  calculation_data: ServiceQuoteCalculationResult;
  invoice_data: InvoiceData | null;
};

export type ServiceInvoicePdfInput = {
  pdfProps: ServiceInvoicePdfProps;
  fileName: string;
};

// Returns null when the quote, its invoice setup, or the service invoice record
// can't be loaded OR when the quote is not a service call, so the route handler
// can render its own not-found UI / fall through to the new-build loader.
export async function loadServiceInvoicePdfInput(
  id: string
): Promise<ServiceInvoicePdfInput | null> {
  const supabase = getSupabaseServer();
  const [quoteResult, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_id, quote_type, quote_data, calculation_data, invoice_data"
      )
      .eq("id", id)
      .single(),
    getSettings()
  ]);

  const { data, error } = quoteResult;
  if (
    error ||
    !data ||
    !data.quote_data ||
    !data.calculation_data ||
    !data.invoice_data
  ) {
    return null;
  }

  const row = data as ServiceInvoiceRow;
  const quoteType = normalizeQuoteType(row.quote_type);
  if (quoteType !== "service_call") return null;

  const quote = row.quote_data;
  const invoiceData = row.invoice_data as InvoiceData;
  const invoice = findInvoice(invoiceData, "service");
  if (!invoice) return null;

  const reference = invoiceDisplayNumber(row.quote_id, invoice);
  const invoiceDateLabel = formatInvoiceDate(invoice.issuedAt ?? invoiceData.generatedAt);

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  // The invoice's freeform lines live on invoice_data.serviceLines once set
  // up, edited independently of the quote. For invoices set up before
  // serviceLines was persisted on the invoice (or a $0 / no-line setup), fall
  // back to the quote's calculation_data.lines so the PDF still renders. The
  // backfill is display-only (it does not change the stored contract amount).
  const sourceLines =
    Array.isArray(invoiceData.serviceLines) && invoiceData.serviceLines.length > 0
      ? invoiceData.serviceLines
      : row.calculation_data.lines;

  const lines = sourceLines.map((line) => ({
    name: line.name,
    comment: line.comment ?? "",
    quantityLabel: line.quantity.toLocaleString(),
    amount: formatCurrency(line.amountCents)
  }));

  const pdfProps: ServiceInvoicePdfProps = {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    reference,
    invoiceDateLabel,
    title: "Service Invoice",
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    clientPhone: quote.clientPhone ?? "",
    projectName: quote.projectName ?? "",
    fullAddress,
    projectType: quote.projectType,
    lines,
    amountDue: formatCurrency(invoice.amountCents),
    paymentTerms: settings.invoicePaymentTerms,
    logoDataUri: getLogoDataUri()
  };

  return {
    pdfProps,
    fileName: `invoice-${reference}.pdf`
  };
}

// Long-form date, e.g. "June 18, 2026". issuedAt / generatedAt are ISO
// timestamps; quoteDate-style ("YYYY-MM-DD") parsing is not needed here.
function formatInvoiceDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}