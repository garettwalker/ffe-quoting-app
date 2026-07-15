import Link from "next/link";
import { EmailPdfButton } from "@/components/pdf/email-pdf-button";
import type { EmailDocKind, InvoiceKind } from "@/lib/send-pdf-email";

type EmailProps = {
  doc: EmailDocKind;
  id: string;
  invoiceKind?: InvoiceKind;
  defaultTo: string;
  defaultSubject: string;
  defaultMessage: string;
  docTitle: string;
};

type PdfActionBarProps = {
  backHref: string; // e.g. `/quotes/${id}`
  downloadHref: string; // server route that streams the PDF
  backLabel?: string; // default "Back to quote"
  downloadLabel?: string; // default "Download PDF"
  email?: EmailProps; // when supplied, renders the Email PDF button
};

// The top toolbar on each printable: a Back link, the Download PDF anchor (a
// plain link to the server PDF route; the route sets Content-Disposition:
// attachment, so it downloads and leaves the page on screen), and optionally an
// Email PDF button. Server component; the email button is the only interactive
// piece (it is a client component nested inside).
export function PdfActionBar({
  backHref,
  downloadHref,
  backLabel = "Back to quote",
  downloadLabel = "Download PDF",
  email
}: PdfActionBarProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <Link
        href={backHref}
        className="rounded-full border border-pine/20 px-5 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
      >
        {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-end gap-3">
        {email ? <EmailPdfButton {...email} /> : null}
        <a
          href={downloadHref}
          download
          className="rounded-full bg-pine px-6 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
        >
          {downloadLabel}
        </a>
      </div>
    </div>
  );
}