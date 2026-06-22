import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// A react-pdf recreation of the on-screen Detailed Quote printable.
// Receives only plain, pre-formatted strings (all money/date/locale formatting
// is done server-side by the print page). Uses built-in react-pdf fonts:
// Times-Bold for the serif headings (matches the Georgia display font on
// screen), Helvetica/Helvetica-Bold for body and the line-items table.
// No Font.register needed.

export type DetailedQuotePdfProps = {
  businessName: string;
  businessEmail: string;
  quoteId: string;
  quoteDateLabel: string; // long form, e.g. "June 18, 2026"
  clientName: string;
  clientEmail: string;
  fullAddress: string; // pre-joined street/city/state/zip
  projectType: string;
  squareFootageLabel: string; // e.g. "2,500 sq ft"
  lines: Array<{
    name: string;
    quantityLabel: string; // already toLocaleString()'d
    unitType: string;
    unitPrice: string; // formatCurrency(...)
    lineTotal: string; // formatCurrency(...)
  }>;
  quoteTotal: string; // formatCurrency(result.clientQuoteTotalCents)
  quoteNotes: string; // settings.defaultQuoteNotes
  logoDataUri: string | null;
};

const COLORS = {
  pine: "#344236",
  deepPine: "#243027",
  moss: "#6e7751",
  clay: "#a56543",
  sand: "#e8ddca",
  cream: "#f7f1e7",
  charcoal: "#1d211d",
  whitewarm: "#fffdf8"
};

// Letter page is 612 x 792 pt. With 48pt side padding the content width is 516.
const COL = {
  item: 212,
  qty: 46,
  unit: 72,
  unitPrice: 93,
  lineTotal: 93
};

const styles = StyleSheet.create({
  // Top/bottom padding reserves space for the fixed header/footer (see the
  // header/footer styles below), which are absolutely positioned so they
  // overlay every page without consuming flow space. Without this reserved
  // space, page 2+ content would slide under the repeated header/footer.
  page: {
    paddingTop: 112,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: COLORS.charcoal,
    backgroundColor: COLORS.whitewarm
  },
  // fixed + absolute: repeats on every page, pinned to the top. Taken out of
  // normal flow so it doesn't double up the page's top padding on page 1.
  header: {
    position: "absolute",
    top: 0,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 34,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e1db"
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center"
  },
  logo: {
    width: 48,
    height: 48,
    marginRight: 14
  },
  businessName: {
    fontFamily: "Times-Bold",
    fontSize: 18,
    color: COLORS.deepPine
  },
  businessEmail: {
    fontSize: 9.5,
    color: "#61635f"
  },
  headerRight: {
    alignItems: "flex-end"
  },
  docTitle: {
    fontFamily: "Times-Bold",
    fontSize: 26,
    color: COLORS.moss
  },
  quoteId: {
    marginTop: 3,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: COLORS.deepPine
  },
  quoteDate: {
    fontSize: 9.5,
    color: "#61635f"
  },
  infoGrid: {
    flexDirection: "row",
    marginBottom: 24
  },
  infoCol: {
    flex: 1
  },
  infoColRight: {
    flex: 1,
    paddingLeft: 24
  },
  label: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.clay,
    marginBottom: 4
  },
  infoPrimary: {
    fontFamily: "Helvetica-Bold",
    color: COLORS.deepPine,
    marginBottom: 2
  },
  infoSecondary: {
    fontSize: 9.5,
    color: "#61635f"
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.clay,
    marginBottom: 8
  },
  table: {
    borderWidth: 1,
    borderColor: "#e0e1db",
    borderRadius: 6
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.sand,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e1db"
  },
  th: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.deepPine,
    paddingHorizontal: 8
  },
  thRight: {
    textAlign: "right"
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    backgroundColor: COLORS.cream,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeee8"
  },
  td: {
    fontSize: 9.5,
    paddingHorizontal: 8,
    color: COLORS.charcoal
  },
  tdBold: {
    fontFamily: "Helvetica-Bold"
  },
  tdRight: {
    textAlign: "right"
  },
  tdDeepPine: {
    color: COLORS.deepPine,
    fontFamily: "Helvetica-Bold"
  },
  totalBox: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "flex-end"
  },
  totalInner: {
    width: 220,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d6d7d1",
    backgroundColor: COLORS.cream,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  totalLabel: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.clay
  },
  totalValue: {
    fontFamily: "Times-Bold",
    fontSize: 17,
    color: COLORS.deepPine
  },
  notes: {
    marginTop: 22,
    backgroundColor: COLORS.sand,
    borderRadius: 8,
    padding: 14,
    fontSize: 9.5,
    lineHeight: 1.5,
    color: "#4a4d49",
    fontFamily: "Helvetica-Bold"
  },
  // fixed + absolute: repeats on every page, pinned to the bottom. Page
  // numbers are appended via the render prop, but only on docs >1 page.
  footer: {
    position: "absolute",
    bottom: 0,
    left: 48,
    right: 48,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#e0e1db",
    textAlign: "center",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#777975"
  }
});

export function DetailedQuotePdfDocument(props: DetailedQuotePdfProps) {
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
    lines,
    quoteTotal,
    quoteNotes,
    logoDataUri
  } = props;

  return (
    <Document
      title={`Quote ${quoteId}`}
      author={businessName}
      subject="Quote"
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header: logo + business on the left, "Quote" + id + date on the right.
            fixed so it repeats on every page (multi-page quotes). */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {logoDataUri ? <Image style={styles.logo} src={logoDataUri} /> : null}
            <View>
              <Text style={styles.businessName}>{businessName}</Text>
              <Text style={styles.businessEmail}>{businessEmail}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>Quote</Text>
            <Text style={styles.quoteId}>{quoteId}</Text>
            <Text style={styles.quoteDate}>{quoteDateLabel}</Text>
          </View>
        </View>

        {/* Prepared For / Project */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text style={styles.label}>PREPARED FOR</Text>
            <Text style={styles.infoPrimary}>{clientName}</Text>
            {clientEmail ? <Text style={styles.infoSecondary}>{clientEmail}</Text> : null}
          </View>
          <View style={styles.infoColRight}>
            <Text style={styles.label}>PROJECT</Text>
            <Text style={styles.infoPrimary}>{fullAddress}</Text>
            <Text style={styles.infoSecondary}>
              {projectType}
              {squareFootageLabel ? ` · ${squareFootageLabel}` : ""}
            </Text>
          </View>
        </View>

        {/* Line items */}
        <Text style={styles.sectionLabel}>SCOPE</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.th, width: COL.item }}>Item</Text>
            <Text style={{ ...styles.th, ...styles.thRight, width: COL.qty }}>Qty</Text>
            <Text style={{ ...styles.th, width: COL.unit }}>Unit</Text>
            <Text style={{ ...styles.th, ...styles.thRight, width: COL.unitPrice }}>
              Unit Price
            </Text>
            <Text style={{ ...styles.th, ...styles.thRight, width: COL.lineTotal }}>
              Line Total
            </Text>
          </View>
          {lines.length === 0 ? (
            <View style={{ ...styles.tableRow, borderBottomWidth: 0 }}>
              <Text style={{ ...styles.td, ...styles.tdBold, color: "#8e8f8b" }}>
                No priced items on this quote.
              </Text>
            </View>
          ) : (
            lines.map((line, index) => (
              <View
                key={`${line.name}-${index}`}
                style={{
                  ...styles.tableRow,
                  borderBottomWidth:
                    index === lines.length - 1 ? 0 : styles.tableRow.borderBottomWidth
                }}
              >
                <Text style={{ ...styles.td, ...styles.tdBold, width: COL.item }}>
                  {line.name}
                </Text>
                <Text style={{ ...styles.td, ...styles.tdRight, width: COL.qty }}>
                  {line.quantityLabel}
                </Text>
                <Text style={{ ...styles.td, width: COL.unit }}>{line.unitType}</Text>
                <Text style={{ ...styles.td, ...styles.tdRight, width: COL.unitPrice }}>
                  {line.unitPrice}
                </Text>
                <Text
                  style={{ ...styles.td, ...styles.tdRight, ...styles.tdDeepPine, width: COL.lineTotal }}
                >
                  {line.lineTotal}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Quote total */}
        <View style={styles.totalBox}>
          <View style={styles.totalInner}>
            <Text style={styles.totalLabel}>QUOTE TOTAL</Text>
            <Text style={styles.totalValue}>{quoteTotal}</Text>
          </View>
        </View>

        {/* Notes */}
        {quoteNotes ? (
          <View style={styles.notes}>
            <Text>{quoteNotes}</Text>
          </View>
        ) : null}

        {/* Footer: fixed so it repeats on every page; page numbers only when >1 page. */}
        <View style={styles.footer} fixed>
          <Text
            render={({ pageNumber, totalPages }) =>
              totalPages > 1
                ? `${businessName} · ${businessEmail} · Quote ${quoteId} · Page ${pageNumber} of ${totalPages}`
                : `${businessName} · ${businessEmail} · Quote ${quoteId}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}