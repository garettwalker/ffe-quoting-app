import Link from "next/link";

type DownloadPdfButtonProps = {
  href: string; // server route that streams the PDF, e.g. `/quotes/${id}/print/pdf`
  backHref: string; // e.g. `/quotes/${id}` — the "Back to quote" link
  backLabel?: string; // default "Back to quote"
  buttonLabel?: string; // default "Download PDF"
};

// A plain anchor to the server PDF route — no client-side react-pdf, no
// generation in the browser, so there is nothing that can blank the page. The
// server route sets Content-Disposition: attachment, so clicking the link
// downloads the file and leaves the current page on screen.
export function DownloadPdfButton({
  href,
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

      <a
        href={href}
        download
        className="rounded-full bg-pine px-6 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
      >
        {buttonLabel}
      </a>
    </div>
  );
}