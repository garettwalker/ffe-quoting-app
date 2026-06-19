import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import {
  PdfFooter,
  PdfHeader,
  PdfInfoGrid,
  PdfList,
  PdfNotes,
  PdfSectionLabel,
  PdfTotalBox,
  pdfPageStyle
} from "./pdf-shared";

// A react-pdf recreation of the on-screen Summary Quote printable: a condensed
// customer-facing version of the quote that shows one subtotal per pricing
// category instead of every line item. No unit prices, no quantities, just
// category subtotals and the quote total. Shares the header/info/total/notes/
// footer building blocks with the Invoice PDF (see pdf-shared.tsx) so the two
// look consistent and the Detailed Quote stays self-contained.
//
// Receives only plain, pre-formatted strings (all money/date/locale formatting
// is done server-side by lib/summary-quote-pdf.ts). Built-in react-pdf fonts:
// Times-Bold for serif headings, Helvetica/Helvetica-Bold for body.

export type SummaryQuotePdfProps = {
  businessName: string;
  businessEmail: string;
  quoteId: string;
  quoteDateLabel: string; // long form, e.g. "June 18, 2026"
  clientName: string;
  clientEmail: string;
  fullAddress: string; // pre-joined street/city/state/zip
  projectType: string;
  squareFootageLabel: string; // e.g. "2,500 sq ft"
  categories: Array<{
    label: string; // already run through categoryDisplayName
    amount: string; // formatCurrency(...)
  }>;
  quoteTotal: string; // formatCurrency(result.clientQuoteTotalCents)
  quoteNotes: string; // settings.defaultQuoteNotes
  logoDataUri: string | null;
};

export function SummaryQuotePdfDocument(props: SummaryQuotePdfProps) {
  const {
    businessName,
    businessEmail,
    quoteId,
    quoteDateLabel,
    clientName,
    clientEmail,
    fullAddress,
    projectType,
    squareFootageLabel,
    categories,
    quoteTotal,
    quoteNotes,
    logoDataUri
  } = props;

  const projectSecondary =
    projectType || squareFootageLabel
      ? [projectType, squareFootageLabel].filter(Boolean).join(" · ")
      : "";

  return (
    <Document title={`Summary Quote ${quoteId}`} author={businessName} subject="Summary Quote">
      <Page size="LETTER" style={pdfPageStyle}>
        <PdfHeader
          businessName={businessName}
          businessEmail={businessEmail}
          docTitle="Summary Quote"
          docId={quoteId}
          dateLabel={quoteDateLabel}
          logoDataUri={logoDataUri}
          titleSize={22}
        />

        <PdfInfoGrid
          leftLabel="PREPARED FOR"
          leftPrimary={clientName}
          leftSecondary={clientEmail || undefined}
          rightLabel="PROJECT"
          rightPrimary={fullAddress}
          rightSecondary={projectSecondary || undefined}
        />

        <PdfSectionLabel>SCOPE SUMMARY</PdfSectionLabel>
        <PdfList items={categories} emptyLabel="No priced items on this quote." />

        <PdfTotalBox label="QUOTE TOTAL" value={quoteTotal} />

        {quoteNotes ? <PdfNotes>{quoteNotes}</PdfNotes> : null}

        <PdfFooter>{`${businessName} · ${businessEmail} · Summary Quote ${quoteId}`}</PdfFooter>
      </Page>
    </Document>
  );
}