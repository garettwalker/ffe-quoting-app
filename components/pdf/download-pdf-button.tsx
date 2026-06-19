"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";

type DownloadPdfButtonProps = {
  document: ReactElement; // a react-pdf <Document> element
  fileName: string; // e.g. "quote-Q-2026-0001.pdf"
  backHref: string; // e.g. `/quotes/${id}` — replaces PrintQuoteButton's back link
  backLabel?: string; // default "Back to quote"
  buttonLabel?: string; // default "Download PDF"
};

// Mirrors the old PrintQuoteButton top bar (a back link on the left, the action
// button on the right), but the action builds a real PDF in the browser and
// downloads it instead of calling window.print().
//
// IMPORTANT: we deliberately do NOT use react-pdf's <PDFDownloadLink>, because
// it renders the PDF eagerly on mount (to populate the link href). If that
// render throws, React unmounts the whole route and the page goes blank.
// Instead we generate the PDF on click via the imperative `pdf().toBlob()`
// API, lazy-load @react-pdf/renderer only when the user clicks, and wrap the
// whole thing in a try/catch so a generation failure shows a small inline
// error instead of blanking the page. (This also makes page load instant —
// react-pdf isn't loaded until you click Download PDF.)
export function DownloadPdfButton({
  document,
  fileName,
  backHref,
  backLabel = "Back to quote",
  buttonLabel = "Download PDF"
}: DownloadPdfButtonProps) {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleDownload() {
    if (status === "working") return;
    setStatus("working");
    setErrorMsg("");
    try {
      // Lazy-load react-pdf only on first click so page navigation stays fast
      // and react-pdf never runs during SSR/hydration.
      const { pdf } = await import("@react-pdf/renderer");
      const instance = pdf(document);
      const blob = await instance.toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      window.document.body.appendChild(anchor);
      anchor.click();
      window.document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch (err) {
      // Show the actual error on screen (not just the console) so it can be
      // reported without opening dev tools. Also log the full object.
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("PDF generation failed:", err);
      setErrorMsg(message);
      setStatus("error");
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link
        href={backHref}
        className="rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
      >
        {backLabel}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        {status === "error" ? (
          <span className="max-w-md text-sm font-black text-clay">
            Could not build the PDF: {errorMsg}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleDownload}
          disabled={status === "working"}
          className="rounded-full bg-pine px-6 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "working" ? "Preparing PDF…" : buttonLabel}
        </button>
      </div>
    </div>
  );
}