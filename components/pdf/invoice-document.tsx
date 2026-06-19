import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  PDF_COLORS,
  PDF_INK,
  PdfFooter,
  PdfHeader,
  PdfInfoGrid,
  PdfList,
  PdfNotes,
  PdfSectionLabel,
  PdfTotalBox,
  pdfPageStyle
} from "./pdf-shared";

// A react-pdf recreation of the on-screen printable invoice. kind is baked
// into the props server-side (title, the charge lines, and the optional
// "previously invoiced" block for the finish invoice), so this component stays
// pure data-in. Shares the header/info/total/notes/footer/list building blocks
// with the Summary Quote (see pdf-shared.tsx). Built-in react-pdf fonts:
// Times-Bold for serif headings, Helvetica/Helvetica-Bold for body.

export type InvoicePdfProps = {
  businessName: string;
  businessEmail: string;
  reference: string; // e.g. "Q-20260619-001-R"
  invoiceDateLabel: string; // long form
  title: string; // "Initial Invoice" or "Finish Invoice"
  clientName: string;
  clientEmail: string;
  fullAddress: string;
  projectType: string;
  squareFootageLabel: string;
  // The charge lines for this invoice: rough-in + permit (initial), or finish.
  lines: Array<{ label: string; amount: string }>;
  // Shown only on the finish invoice: what was already invoiced on the initial.
  previouslyInvoiced: {
    previouslyInvoicedAmount: string;
    contractTotal: string;
  } | null;
  amountDue: string; // formatCurrency(invoice.amountCents)
  paymentTerms: string; // settings.invoicePaymentTerms
  logoDataUri: string | null;
};

const priorStyles = StyleSheet.create({
  box: {
    marginTop: 14,
    backgroundColor: PDF_COLORS.sand,
    borderRadius: 8,
    padding: 12,
    fontSize: 9.5
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2
  },
  label: {
    fontFamily: "Helvetica",
    color: PDF_INK.textStrong
  },
  value: {
    fontFamily: "Helvetica-Bold",
    color: PDF_INK.textStrong
  },
  divider: {
    marginTop: 4,
    marginBottom: 4,
    height: 1,
    backgroundColor: PDF_INK.borderPineFaint
  }
});

export function InvoicePdfDocument(props: InvoicePdfProps) {
  const {
    businessName,
    businessEmail,
    reference,
    invoiceDateLabel,
    title,
    clientName,
    clientEmail,
    fullAddress,
    projectType,
    squareFootageLabel,
    lines,
    previouslyInvoiced,
    amountDue,
    paymentTerms,
    logoDataUri
  } = props;

  const projectSecondary =
    projectType || squareFootageLabel
      ? [projectType, squareFootageLabel].filter(Boolean).join(" · ")
      : "";

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
          rightPrimary={fullAddress}
          rightSecondary={projectSecondary || undefined}
        />

        <PdfSectionLabel>{title}</PdfSectionLabel>
        <PdfList items={lines} emptyLabel="No charges on this invoice." />

        {previouslyInvoiced ? (
          <View style={priorStyles.box}>
            <View style={priorStyles.row}>
              <Text style={priorStyles.label}>Previously invoiced (Rough-In + Permit)</Text>
              <Text style={priorStyles.value}>
                {previouslyInvoiced.previouslyInvoicedAmount}
              </Text>
            </View>
            <View style={priorStyles.divider} />
            <View style={priorStyles.row}>
              <Text style={priorStyles.label}>Contract total</Text>
              <Text style={priorStyles.value}>{previouslyInvoiced.contractTotal}</Text>
            </View>
          </View>
        ) : null}

        <PdfTotalBox label="AMOUNT DUE" value={amountDue} />

        {paymentTerms ? <PdfNotes>{paymentTerms}</PdfNotes> : null}

        <PdfFooter>{`${businessName} · ${businessEmail} · Invoice ${reference}`}</PdfFooter>
      </Page>
    </Document>
  );
}