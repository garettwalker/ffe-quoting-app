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
  title: string; // "Initial Invoice" or "Final Invoice"
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  projectName: string; // residence / site name, "" when not set
  fullAddress: string;
  projectType: string;
  squareFootageLabel: string;
  // The charge lines for this invoice: rough-in + permit (initial), or finish.
  lines: Array<{ label: string; amount: string }>;
  // Scope-of-work line items: each line with its name, a customer-facing
  // comment underneath when present, a "qty x unit price" detail string, and
  // the line total. All money formatting is pre-done by lib/invoice-pdf.ts so
  // this component stays pure data-in. The contract is the sum of these line
  // totals; the charge lines above bill the rough-in/finish split of it.
  scopeLines: Array<{ name: string; comment: string; detail: string; total: string }>;
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

const scopeStyles = StyleSheet.create({
  list: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: PDF_INK.borderPine,
    borderRadius: 6
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: PDF_COLORS.cream,
    borderBottomWidth: 1,
    borderBottomColor: PDF_INK.borderPineFaint
  },
  left: {
    flex: 1,
    paddingRight: 12
  },
  name: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.charcoal
  },
  comment: {
    marginTop: 2,
    fontSize: 8.5,
    lineHeight: 1.35,
    fontFamily: "Helvetica-Oblique",
    color: PDF_INK.textMuted
  },
  right: {
    alignItems: "flex-end"
  },
  total: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.charcoal
  },
  detail: {
    marginTop: 1,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: PDF_INK.textMuted
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
    clientPhone,
    projectName,
    fullAddress,
    projectType,
    squareFootageLabel,
    lines,
    scopeLines,
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
        <PdfList items={lines} emptyLabel="No charges on this invoice." />

        {scopeLines.length > 0 ? (
          <>
            <PdfSectionLabel>SCOPE OF WORK</PdfSectionLabel>
            {/* react-pdf auto-wraps this list across pages when the scope is
                long. Each row has wrap={false} so a single line item (name +
                comment + total) is never split across a page break: if a row
                does not fit in the remaining space it moves whole to the next
                page. The fixed header/footer above repeat on every page and
                the footer prints "Page X of Y" when there is more than one. */}
            <View style={scopeStyles.list}>
              {scopeLines.map((line, index) => (
                <View
                  key={`${line.name}-${index}`}
                  wrap={false}
                  style={{
                    ...scopeStyles.row,
                    borderBottomWidth:
                      index === scopeLines.length - 1
                        ? 0
                        : scopeStyles.row.borderBottomWidth
                  }}
                >
                  <View style={scopeStyles.left}>
                    <Text style={scopeStyles.name}>{line.name}</Text>
                    {line.comment ? (
                      <Text style={scopeStyles.comment}>{line.comment}</Text>
                    ) : null}
                  </View>
                  <View style={scopeStyles.right}>
                    <Text style={scopeStyles.total}>{line.total}</Text>
                    <Text style={scopeStyles.detail}>{line.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

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