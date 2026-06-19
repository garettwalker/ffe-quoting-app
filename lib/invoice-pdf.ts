import { formatCurrency } from "@/lib/currency";
import {
  computeInvoiceAmounts,
  findInvoice,
  invoiceReference
} from "@/lib/invoice-calculations";
import { getLogoDataUri } from "@/lib/pdf-logo";
import { getSettings } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import type {
  InvoiceData,
  InvoiceKind,
  QuoteCalculationResult,
  QuoteFormState
} from "@/lib/types";
import type { InvoicePdfProps } from "@/components/pdf/invoice-document";

// Server-only helper shared by the printable invoice preview page
// (app/quotes/[id]/invoices/[kind]/print/page.tsx) and the PDF download route
// (app/quotes/[id]/invoices/[kind]/pdf/route.ts). Loads the saved quote row +
// invoice setup + live settings, resolves the requested invoice (initial or
// finish), and builds the plain, pre-formatted props the react-pdf document
// needs — all money/date/locale formatting happens here so the PDF component
// stays pure data-in and the preview and downloaded PDF can never drift apart.

type InvoiceQuoteRow = {
  id: string;
  quote_id: string;
  quote_data: QuoteFormState;
  calculation_data: QuoteCalculationResult;
  invoice_data: InvoiceData | null;
};

export type InvoicePdfInput = {
  pdfProps: InvoicePdfProps;
  fileName: string;
};

// Returns null when the quote, its invoice setup, or the requested invoice
// kind can't be loaded, so callers can render their own not-found UI.
export async function loadInvoicePdfInput(
  id: string,
  kind: string
): Promise<InvoicePdfInput | null> {
  if (kind !== "initial" && kind !== "finish") return null;

  const [quoteResult, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_id, quote_data, calculation_data, invoice_data")
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

  const row = data as InvoiceQuoteRow;
  const quote = row.quote_data;
  const invoiceData = row.invoice_data as InvoiceData;
  const invoice = findInvoice(invoiceData, kind as InvoiceKind);
  if (!invoice) return null;

  const amounts = computeInvoiceAmounts(invoiceData);
  const reference = invoiceReference(row.quote_id, kind as InvoiceKind);
  const invoiceDateLabel = formatInvoiceDate(invoice.issuedAt ?? invoiceData.generatedAt);

  const fullAddress = [
    quote.projectStreet,
    quote.projectCity,
    quote.projectState,
    quote.projectZip
  ]
    .filter(Boolean)
    .join(", ");

  const title = kind === "initial" ? "Initial Invoice" : "Finish Invoice";

  const lines =
    kind === "initial"
      ? [
          {
            label: `Rough-In (${invoiceData.roughInPercent}% of contract)`,
            amount: formatCurrency(amounts.roughInAmountCents)
          },
          {
            label: "Permit Fee",
            amount: formatCurrency(invoiceData.permitFeeCents)
          }
        ]
      : [
          {
            label: `Finish (${invoiceData.finishPercent}% of contract)`,
            amount: formatCurrency(amounts.finishAmountCents)
          }
        ];

  const previouslyInvoiced =
    kind === "finish"
      ? {
          previouslyInvoicedAmount: formatCurrency(amounts.initialInvoiceAmountCents),
          contractTotal: formatCurrency(invoiceData.contractAmountCents)
        }
      : null;

  const pdfProps: InvoicePdfProps = {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    reference,
    invoiceDateLabel,
    title,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    fullAddress,
    projectType: quote.projectType,
    squareFootageLabel: `${quote.squareFootage.toLocaleString()} sq ft`,
    lines,
    previouslyInvoiced,
    amountDue: formatCurrency(invoice.amountCents),
    paymentTerms: settings.invoicePaymentTerms,
    logoDataUri: getLogoDataUri()
  };

  return {
    pdfProps,
    fileName: `${reference}.pdf`
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