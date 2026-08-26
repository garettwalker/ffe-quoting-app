import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import {
  PdfFooter,
  PdfHeader,
  PdfInfoGrid,
  PdfNotes,
  PdfSectionLabel,
  PdfServiceLineTable,
  PdfTotalBox,
  pdfPageStyle,
  type PdfServiceLine
} from "./pdf-shared";

// Purpose-built PDF for a service-call quote. Reuses the shared pdf blocks
// (header / info grid / total / notes / footer) so it looks consistent with the
// new-build documents, but the line table is the simpler service layout:
// Description / Qty / Amount (no unit price, no pricing levers). The quote total
// is the sum of the line amounts. All money/date/locale formatting is pre-done
// by lib/service-quote-pdf.ts so this component stays pure data-in.

export type ServiceQuotePdfProps = {
  businessName: string;
  businessEmail: string;
  quoteId: string;
  quoteDateLabel: string;
  clientName: string;
  clientEmail: string;
  projectName: string;
  fullAddress: string;
  projectType: string;
  lines: PdfServiceLine[];
  quoteTotal: string;
  quoteNotes: string;
  logoDataUri: string | null;
};

export function ServiceQuotePdfDocument(props: ServiceQuotePdfProps) {
  const {
    businessName,
    businessEmail,
    quoteId,
    quoteDateLabel,
    clientName,
    clientEmail,
    projectName,
    fullAddress,
    projectType,
    lines,
    quoteTotal,
    quoteNotes,
    logoDataUri
  } = props;

  const projectSecondary = projectType || "";

  return (
    <Document title={`Quote ${quoteId}`} author={businessName} subject="Quote">
      <Page size="LETTER" style={pdfPageStyle}>
        <PdfHeader
          businessName={businessName}
          businessEmail={businessEmail}
          docTitle="Quote"
          docId={quoteId}
          dateLabel={quoteDateLabel}
          logoDataUri={logoDataUri}
        />

        <PdfInfoGrid
          leftLabel="PREPARED FOR"
          leftPrimary={clientName}
          leftSecondary={clientEmail || undefined}
          rightLabel="PROJECT"
          rightPrimary={projectName || fullAddress}
          rightSecondary={
            projectName
              ? [fullAddress, projectSecondary].filter(Boolean).join(" · ") || undefined
              : projectSecondary || undefined
          }
        />

        <PdfSectionLabel>LINE ITEMS</PdfSectionLabel>
        <PdfServiceLineTable lines={lines} emptyLabel="No line items on this quote." />

        <PdfTotalBox label="QUOTE TOTAL" value={quoteTotal} />

        {quoteNotes ? <PdfNotes>{quoteNotes}</PdfNotes> : null}

        <PdfFooter>{`${businessName} · ${businessEmail} · Quote ${quoteId}`}</PdfFooter>
      </Page>
    </Document>
  );
}