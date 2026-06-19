"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactElement } from "react";

// react-pdf's PDFDownloadLink is a browser-only API (it generates the PDF in
// the browser on click). Importing it during SSR/SSG throws, so we load it
// dynamically with ssr: false. Combined with transpilePackages in next.config.js,
// this is the documented working setup for @react-pdf/renderer in Next 14.
const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => <span className="text-sm font-black text-deep-pine">Preparing…</span> }
);

type DownloadPdfButtonProps = {
  document: ReactElement; // a react-pdf <Document> element
  fileName: string; // e.g. "quote-Q-2026-0001.pdf"
  backHref: string; // e.g. `/quotes/${id}` — replaces PrintQuoteButton's back link
  backLabel?: string; // default "Back to quote"
  buttonLabel?: string; // default "Download PDF"
};

// Mirrors the old PrintQuoteButton top bar (a back link on the left, the action
// button on the right), but the action downloads a real PDF instead of calling
// window.print(). PDFDownloadLink invokes its child as a render-prop with a
// `loading` flag, so we can show "Preparing PDF…" while the file is being built.
export function DownloadPdfButton({
  document,
  fileName,
  backHref,
  backLabel = "Back to quote",
  buttonLabel = "Download PDF"
}: DownloadPdfButtonProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link
        href={backHref}
        className="rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
      >
        {backLabel}
      </Link>

      <PDFDownloadLink
        document={document}
        fileName={fileName}
        style={{
          display: "inline-flex",
          borderRadius: 9999,
          backgroundColor: "#344236",
          padding: "8px 24px",
          fontSize: "0.875rem",
          fontWeight: 900,
          color: "#fffdf8",
          boxShadow: "0 18px 50px rgba(29,33,29,0.08)",
          textDecoration: "none"
        }}
      >
        {({ loading }: { loading: boolean }) => (loading ? "Preparing PDF…" : buttonLabel)}
      </PDFDownloadLink>
    </div>
  );
}