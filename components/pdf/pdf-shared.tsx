import React from "react";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

// Shared building blocks for the customer-facing react-pdf documents
// (Summary Quote, Invoice). The Detailed Quote has its own self-contained
// document, so this module exists to keep the new documents from duplicating
// ~180 lines of header/footer/total/notes styles. The style values here are
// copied exactly from detailed-quote-document.tsx so every customer-facing PDF
// looks consistent.
//
// No rgba()/alpha colors anywhere: react-pdf composites alpha through the PDF
// graphics state inconsistently and the subtle borders render as red/dark
// artifacts. Every muted color below is a solid hex pre-blended against the
// whitewarm page background (#fffdf8).

export const PDF_COLORS = {
  pine: "#344236",
  deepPine: "#243027",
  moss: "#6e7751",
  clay: "#a56543",
  sand: "#e8ddca",
  cream: "#f7f1e7",
  charcoal: "#1d211d",
  whitewarm: "#fffdf8"
};

// Solid muted colors (pre-blended against the whitewarm page background).
export const PDF_INK = {
  borderPine: "#e0e1db", // faint pine border, ~15% over bg
  borderPineStrong: "#d6d7d1", // ~20% over bg (total-box outline)
  borderPineFaint: "#eeeee8", // ~8% over bg (row dividers)
  textMuted: "#61635f", // ~70% charcoal over bg
  textSofter: "#8e8f8b", // ~50% charcoal over bg
  textStrong: "#4a4d49", // ~80% charcoal over bg (notes)
  textFooter: "#777975" // ~60% charcoal over bg (footer)
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
    color: PDF_COLORS.charcoal,
    backgroundColor: PDF_COLORS.whitewarm
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
    borderBottomColor: PDF_INK.borderPine
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
    color: PDF_COLORS.deepPine
  },
  businessEmail: {
    fontSize: 9.5,
    color: PDF_INK.textMuted
  },
  headerRight: {
    alignItems: "flex-end"
  },
  docTitle: {
    fontFamily: "Times-Bold",
    fontSize: 26,
    color: PDF_COLORS.moss
  },
  quoteId: {
    marginTop: 3,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.deepPine
  },
  quoteDate: {
    fontSize: 9.5,
    color: PDF_INK.textMuted
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
    color: PDF_COLORS.clay,
    marginBottom: 4
  },
  infoPrimary: {
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.deepPine,
    marginBottom: 2
  },
  infoSecondary: {
    fontSize: 9.5,
    color: PDF_INK.textMuted
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.clay,
    marginBottom: 8
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
    borderColor: PDF_INK.borderPineStrong,
    backgroundColor: PDF_COLORS.cream,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  totalLabel: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.clay
  },
  totalValue: {
    fontFamily: "Times-Bold",
    fontSize: 17,
    color: PDF_COLORS.deepPine
  },
  notes: {
    marginTop: 22,
    backgroundColor: PDF_COLORS.sand,
    borderRadius: 8,
    padding: 14,
    fontSize: 9.5,
    lineHeight: 1.5,
    color: PDF_INK.textStrong,
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
    borderTopColor: PDF_INK.borderPine,
    textAlign: "center",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PDF_INK.textFooter
  }
});

export const pdfPageStyle = styles.page;

// A bordered box of label/amount rows (one per line item / category), with a
// faint divider between rows and none after the last. Used by the Summary
// Quote (category subtotals) and the Invoice (charge lines). Empty state shows
// a muted message instead of an empty box.
const listStyles = StyleSheet.create({
  list: {
    borderWidth: 1,
    borderColor: PDF_INK.borderPine,
    borderRadius: 6
  },
  row: {
    flexDirection: "row",
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: PDF_COLORS.cream,
    borderBottomWidth: 1,
    borderBottomColor: PDF_INK.borderPineFaint
  },
  rowLabel: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.charcoal
  },
  rowAmount: {
    width: 120,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.deepPine
  },
  empty: {
    padding: 14,
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_INK.textSofter
  }
});

export function PdfList({
  items,
  emptyLabel
}: {
  items: Array<{ label: string; amount: string }>;
  emptyLabel?: string;
}) {
  return (
    <View style={listStyles.list}>
      {items.length === 0 ? (
        <View style={listStyles.empty}>
          <Text>{emptyLabel ?? "No priced items on this quote."}</Text>
        </View>
      ) : (
        items.map((entry, index) => (
          <View
            key={`${entry.label}-${index}`}
            style={{
              ...listStyles.row,
              borderBottomWidth:
                index === items.length - 1 ? 0 : listStyles.row.borderBottomWidth
            }}
          >
            <Text style={listStyles.rowLabel}>{entry.label}</Text>
            <Text style={listStyles.rowAmount}>{entry.amount}</Text>
          </View>
        ))
      )}
    </View>
  );
}

type HeaderProps = {
  businessName: string;
  businessEmail: string;
  docTitle: string;
  docId: string; // quote id or invoice reference
  dateLabel: string;
  logoDataUri: string | null;
  titleSize?: number; // default 26; pass a smaller value for longer titles
};

export function PdfHeader({
  businessName,
  businessEmail,
  docTitle,
  docId,
  dateLabel,
  logoDataUri,
  titleSize = 26
}: HeaderProps) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        {logoDataUri ? <Image style={styles.logo} src={logoDataUri} /> : null}
        <View>
          <Text style={styles.businessName}>{businessName}</Text>
          <Text style={styles.businessEmail}>{businessEmail}</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        <Text style={{ ...styles.docTitle, fontSize: titleSize }}>{docTitle}</Text>
        <Text style={styles.quoteId}>{docId}</Text>
        <Text style={styles.quoteDate}>{dateLabel}</Text>
      </View>
    </View>
  );
}

type InfoGridProps = {
  leftLabel: string;
  leftPrimary: string;
  leftSecondary?: string;
  rightLabel: string;
  rightPrimary: string;
  rightSecondary?: string;
};

export function PdfInfoGrid({
  leftLabel,
  leftPrimary,
  leftSecondary,
  rightLabel,
  rightPrimary,
  rightSecondary
}: InfoGridProps) {
  return (
    <View style={styles.infoGrid}>
      <View style={styles.infoCol}>
        <Text style={styles.label}>{leftLabel}</Text>
        <Text style={styles.infoPrimary}>{leftPrimary}</Text>
        {leftSecondary ? <Text style={styles.infoSecondary}>{leftSecondary}</Text> : null}
      </View>
      <View style={styles.infoColRight}>
        <Text style={styles.label}>{rightLabel}</Text>
        <Text style={styles.infoPrimary}>{rightPrimary}</Text>
        {rightSecondary ? <Text style={styles.infoSecondary}>{rightSecondary}</Text> : null}
      </View>
    </View>
  );
}

export function PdfSectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function PdfTotalBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalBox}>
      <View style={styles.totalInner}>
        <Text style={styles.totalLabel}>{label}</Text>
        <Text style={styles.totalValue}>{value}</Text>
      </View>
    </View>
  );
}

export function PdfNotes({ children }: { children: string }) {
  return (
    <View style={styles.notes}>
      <Text>{children}</Text>
    </View>
  );
}

export function PdfFooter({ children }: { children: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text
        render={({ pageNumber, totalPages }) =>
          totalPages > 1
            ? `${children} · Page ${pageNumber} of ${totalPages}`
            : children
        }
      />
    </View>
  );
}