import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  PDF_COLORS,
  PDF_INK,
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
// the quote and invoice line layouts match exactly.
//
// A service call comes in two shapes:
//   - UNSPLIT: a single "Service Invoice" whose amount due is the sum of the
//     line amounts (no previously-invoiced block).
//   - SPLIT: a "Deposit Invoice" (kind initial) and a "Final Invoice" (kind
//     finish). The final carries a "previously invoiced (Deposit)" block above
//     the amount due so the customer sees the deposit already paid against the
//     contract — mirroring the new-build finish invoice's previously-invoiced
//     block. All money / date / locale formatting is pre-done by
//     lib/service-invoice-pdf.ts so this component stays pure data-in.

export type ServiceInvoicePdfProps = {
  businessName: string;
  businessEmail: string;
  reference: string; // e.g. "Q-20260619-001-S" or "INV-0001"
  invoiceDateLabel: string; // long form
  title: string; // "Service Invoice" | "Deposit Invoice" | "Final Invoice"
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  projectName: string; // residence / site name, "" when not set
  fullAddress: string;
  projectType: string;
  lines: PdfServiceLine[];
  // Shown only on the final invoice of a split service call: the deposit
  // already invoiced against the contract. Null for a service / deposit
  // invoice.
  previouslyInvoiced?: {
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

export function ServiceInvoicePdfDocument(props: ServiceInvoicePdfProps) {
  const {
    businessName,
    businessEmail,
    reference,
    invoiceDateLabel,
    title,
    clientName,
    clientEmail,
    clientPhone,
    projectName,
    fullAddress,
    projectType,
    lines,
    previouslyInvoiced,
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
          leftTertiary={clientPhone || undefined}
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

        {previouslyInvoiced ? (
          <View style={priorStyles.box}>
            <View style={priorStyles.row}>
              <Text style={priorStyles.label}>Previously invoiced (Deposit)</Text>
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