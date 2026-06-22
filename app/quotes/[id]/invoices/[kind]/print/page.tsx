import Image from "next/image";
import Link from "next/link";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { loadInvoicePdfInput } from "@/lib/invoice-pdf";

type PageProps = {
  params: { id: string; kind: string };
};

// Always read the live business info / payment terms from Supabase.
export const dynamic = "force-dynamic";

// Printable invoice (initial or finish). The on-screen section below is a
// preview of the downloaded PDF; both render from the same pre-formatted props
// built by loadInvoicePdfInput, so they can never drift apart. Clicking
// Download PDF hits the server route /quotes/[id]/invoices/[kind]/pdf which
// renders the react-pdf document to a buffer and streams it back as a file
// download. kind is validated by the helper (returns null for anything other
// than initial/finish, or when invoicing has not been set up).
export default async function PrintInvoicePage({ params }: PageProps) {
  const input = await loadInvoicePdfInput(params.id, params.kind);
  if (!input) {
    return <InvoiceNotFound />;
  }

  const { pdfProps } = input;
  const projectSecondary = [pdfProps.projectType, pdfProps.squareFootageLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <DownloadPdfButton
        href={`/quotes/${params.id}/invoices/${params.kind}/pdf`}
        backHref={`/quotes/${params.id}/invoices`}
        backLabel="Back to invoices"
        buttonLabel="Download PDF"
      />

      <section className="rounded-xl2 border border-pine/10 bg-whitewarm p-8 shadow-soft">
        <div className="flex flex-col gap-6 border-b border-pine/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/ffe-logo.png"
              alt="Freedom Family Electric logo"
              width={64}
              height={64}
              priority
              className="h-16 w-16 rounded-full object-contain"
            />
            <div>
              <p className="font-display text-2xl font-bold text-deep-pine">
                {pdfProps.businessName}
              </p>
              <p className="text-sm font-bold text-charcoal/70">
                {pdfProps.businessEmail}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="font-display text-3xl font-bold tracking-[-0.03em] text-moss">
              Invoice
            </p>
            <p className="mt-1 text-sm font-black text-deep-pine">{pdfProps.reference}</p>
            <p className="text-sm text-charcoal/70">{pdfProps.invoiceDateLabel}</p>
          </div>
        </div>

        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
              Bill To
            </p>
            <p className="font-black text-deep-pine">{pdfProps.clientName}</p>
            {pdfProps.clientEmail ? (
              <p className="text-sm text-charcoal/70">{pdfProps.clientEmail}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
              Project
            </p>
            <p className="font-bold text-charcoal">{pdfProps.fullAddress}</p>
            {projectSecondary ? (
              <p className="text-sm text-charcoal/70">{projectSecondary}</p>
            ) : null}
          </div>
        </div>

        <p className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-clay">
          {pdfProps.title}
        </p>

        <div className="overflow-hidden rounded-xl1 border border-pine/10">
          <div className="divide-y divide-pine/10 bg-cream">
            {pdfProps.lines.map((line) => (
              <InvoiceLine key={line.label} label={line.label} amount={line.amount} />
            ))}
          </div>
        </div>

        {pdfProps.previouslyInvoiced ? (
          <div className="mt-4 rounded-soft bg-sand/60 p-4 text-sm font-bold text-charcoal/75">
            <div className="flex items-center justify-between gap-4">
              <span>Previously invoiced (Rough-In + Permit)</span>
              <span>{pdfProps.previouslyInvoiced.previouslyInvoicedAmount}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <span>Contract total</span>
              <span>{pdfProps.previouslyInvoiced.contractTotal}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs rounded-xl1 border border-pine/15 bg-cream px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black uppercase tracking-[0.12em] text-clay">
                Amount Due
              </p>
              <p className="font-display text-2xl font-bold text-deep-pine">
                {pdfProps.amountDue}
              </p>
            </div>
          </div>
        </div>

        {pdfProps.paymentTerms ? (
          <div className="mt-6 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/80">
            {pdfProps.paymentTerms}
          </div>
        ) : null}

        <div className="mt-8 border-t border-pine/10 pt-4 text-center text-xs font-bold text-charcoal/60">
          {pdfProps.businessName} · {pdfProps.businessEmail} · Invoice{" "}
          {pdfProps.reference}
        </div>
      </section>
    </div>
  );
}

function InvoiceLine({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <span className="font-bold text-charcoal">{label}</span>
      <span className="font-black text-deep-pine">{amount}</span>
    </div>
  );
}

function InvoiceNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-4 font-display text-3xl font-bold text-moss">
        Invoice not found.
      </p>
      <p className="mb-6 text-charcoal/75">
        This invoice has not been set up yet, or the quote could not be loaded.
      </p>
      <Link
        href="/quotes"
        className="inline-flex rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card hover:bg-deep-pine"
      >
        Back to Quotes
      </Link>
    </div>
  );
}