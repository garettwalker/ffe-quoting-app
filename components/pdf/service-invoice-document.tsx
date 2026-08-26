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

// Purpose-built PDF for a service-call invoice. Reuses the shared pdf blocks
// (header / info grid / total / notes / footer) and the same service line
// table as the service quote (Description / Qty / Amount — no unit price), so
// the quote and invoice line layouts match exactly. There is no rough-in /
// finish split and no "previously invoiced" block: a service call has a single
// invoice whose amount due is the sum of the line amounts. All money / date /
// locale formatting is pre-done by lib/service-invoice-pdf.ts so this component
// stays pure data-in.

export type ServiceInvoicePdfProps = {
  businessName: string;
  businessEmail: string;
  reference: string; // e.g. "Q-20260619-001-S" or "INV-0001"
  invoiceDateLabel: string; // long form
  title: string; // "Service Invoice"
  clientName: string;
  clientEmail: string;
  projectName: string; // residence / site name, "" when not set
  fullAddress: string;
  projectType: string;
  lines: PdfServiceLine[];
  amountDue: string; // formatCurrency(invoice.amountCents)
  paymentTerms: string; // settings.invoicePaymentTerms
  logoDataUri: string | null;
};

export function ServiceInvoicePdfDocument(props: ServiceInvoicePdfProps) {
  const {
    businessName,
    businessEmail,
    reference,
    invoiceDateLabel,
    title,
    clientName,
    clientEmail,
    projectName,
    fullAddress,
    projectType,
    lines,
    amountDue,
    paymentTerms,
    logoDataUri
  } = props;

  const projectSecondary = projectType || "";

  return (
    <Document title={`Invoice ${reference}`} author={businessName} subject="Invoice">
      <Page size="LETTER" style={pdfPageStyle}>
        <PdfHeader
          businessName={businessName}
          businessEmail={businessEmail}
          docTitle="Invoice"
          docId={reference}
          dateLabel={invoiceDateLabel}
          logoDataUri={logoDataUri}
        />

        <PdfInfoGrid
          leftLabel="BILL TO"
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

        <PdfSectionLabel>{title}</PdfSectionLabel>
        <PdfServiceLineTable lines={lines} emptyLabel="No charges on this invoice." />

        <PdfTotalBox label="AMOUNT DUE" value={amountDue} />

        {paymentTerms ? <PdfNotes>{paymentTerms}</PdfNotes> : null}

        <PdfFooter>{`${businessName} · ${businessEmail} · Invoice ${reference}`}</PdfFooter>
      </Page>
    </Document>
  );
}