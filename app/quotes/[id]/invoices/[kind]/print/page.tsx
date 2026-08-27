import Image from "next/image";
import Link from "next/link";
import { PdfActionBar } from "@/components/pdf/pdf-action-bar";
import { getCustomerEmailsForQuote } from "@/lib/customers";
import { loadInvoicePdfInput } from "@/lib/invoice-pdf";
import { fetchQuoteType } from "@/lib/service-quote-pdf";
import { loadServiceInvoicePdfInput } from "@/lib/service-invoice-pdf";
import { buildEmailDefaults, type InvoiceKind } from "@/lib/send-pdf-email";

type PageProps = {
  params: { id: string; kind: string };
};

// Always read the live business info / payment terms from Supabase.
export const dynamic = "force-dynamic";

// Printable invoice. Dispatch is by QUOTE TYPE, not kind: a service call may be
// unsplit (kind "service") or split (kind "initial" deposit + "finish" final),
// so a service-call quote routes ALL of its invoice kinds to the service print
// page; a new build routes initial/finish to the new-build print page. The
// on-screen section below is a preview of the downloaded PDF; both render from
// the same pre-formatted props built by the loaders, so they can never drift
// apart. Clicking Download PDF hits /quotes/[id]/invoices/[kind]/pdf which
// renders the react-pdf document to a buffer and streams it back. kind is
// validated by the loaders (return null for an unknown kind or when invoicing
// has not been set up).
export default async function PrintInvoicePage({ params }: PageProps) {
  const quoteType = await fetchQuoteType(params.id);
  if (quoteType === "service_call") {
    return (
      <ServiceInvoicePrintPage
        id={params.id}
        kind={params.kind as "service" | "initial" | "finish"}
      />
    );
  }
  return <NewBuildInvoicePrintPage id={params.id} kind={params.kind} />;
}

// --- New build (initial / finish) -------------------------------------------

async function NewBuildInvoicePrintPage({
  id,
  kind
}: {
  id: string;
  kind: string;
}) {
  const input = await loadInvoicePdfInput(id, kind);
  if (!input) {
    return <InvoiceNotFound />;
  }

  // The linked customer's emails (empty when no customer is linked) so the
  // Email To field can offer them as suggestions for a multi-recipient send.
  const suggestedEmails = await getCustomerEmailsForQuote(id);

  const { pdfProps } = input;
  const projectName = pdfProps.projectName || "";
  const projectPrimary = projectName || pdfProps.fullAddress;
  const projectSecondary = projectName
    ? [pdfProps.fullAddress, pdfProps.projectType, pdfProps.squareFootageLabel]
        .filter(Boolean)
        .join(" · ")
    : [pdfProps.projectType, pdfProps.squareFootageLabel]
        .filter(Boolean)
        .join(" · ");

  const emailDefaults = buildEmailDefaults({
    doc: "invoice",
    reference: pdfProps.reference,
    businessName: pdfProps.businessName,
    quoteUuid: id,
    invoiceKind: kind as InvoiceKind
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PdfActionBar
        backHref={`/quotes/${id}/invoices`}
        downloadHref={`/quotes/${id}/invoices/${kind}/pdf`}
        backLabel="Back to invoices"
        downloadLabel="Download PDF"
        email={{
          doc: "invoice",
          id,
          invoiceKind: kind as InvoiceKind,
          defaultTo: pdfProps.clientEmail ?? "",
          defaultSubject: emailDefaults.subject,
          defaultMessage: emailDefaults.message,
          docTitle: pdfProps.title,
          suggestedEmails
        }}
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
            {pdfProps.clientPhone ? (
              <p className="text-sm text-charcoal/70">{pdfProps.clientPhone}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
              Project
            </p>
            <p className="font-bold text-charcoal">{projectPrimary}</p>
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

        {pdfProps.scopeLines.length > 0 ? (
          <div className="mt-6">
            <p className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-clay">
              Scope of work
            </p>
            <div className="overflow-hidden rounded-xl1 border border-pine/10">
              <div className="divide-y divide-pine/10 bg-cream">
                {pdfProps.scopeLines.map((line, index) => (
                  <InvoiceScopeLine
                    key={index}
                    name={line.name}
                    comment={line.comment}
                    detail={line.detail}
                    total={line.total}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

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

// --- Service call -----------------------------------------------------------

async function ServiceInvoicePrintPage({
  id,
  kind
}: {
  id: string;
  kind: "service" | "initial" | "finish";
}) {
  const input = await loadServiceInvoicePdfInput(id, kind);
  if (!input) {
    return <InvoiceNotFound />;
  }

  const suggestedEmails = await getCustomerEmailsForQuote(id);

  const { pdfProps } = input;
  const projectName = pdfProps.projectName || "";
  const projectPrimary = projectName || pdfProps.fullAddress;
  const projectSecondary = projectName
    ? [pdfProps.fullAddress, pdfProps.projectType].filter(Boolean).join(" · ")
    : pdfProps.projectType;

  const emailDefaults = buildEmailDefaults({
    doc: "invoice",
    reference: pdfProps.reference,
    businessName: pdfProps.businessName,
    quoteUuid: id,
    invoiceKind: kind
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PdfActionBar
        backHref={`/quotes/${id}/invoices`}
        downloadHref={`/quotes/${id}/invoices/${kind}/pdf`}
        backLabel="Back to invoices"
        downloadLabel="Download PDF"
        email={{
          doc: "invoice",
          id,
          invoiceKind: kind,
          defaultTo: pdfProps.clientEmail ?? "",
          defaultSubject: emailDefaults.subject,
          defaultMessage: emailDefaults.message,
          docTitle: pdfProps.title,
          suggestedEmails
        }}
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
            {pdfProps.clientPhone ? (
              <p className="text-sm text-charcoal/70">{pdfProps.clientPhone}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
              Project
            </p>
            <p className="font-bold text-charcoal">{projectPrimary}</p>
            {projectSecondary ? (
              <p className="text-sm text-charcoal/70">{projectSecondary}</p>
            ) : null}
          </div>
        </div>

        <p className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-clay">
          {pdfProps.title}
        </p>

        <div className="overflow-hidden rounded-xl1 border border-pine/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-sand text-deep-pine">
              <tr>
                <th className="p-3 font-black">Description</th>
                <th className="p-3 text-right font-black">Qty</th>
                <th className="p-3 text-right font-black">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pine/10 bg-cream">
              {pdfProps.lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="p-3 text-sm font-bold text-charcoal/60"
                  >
                    No charges on this invoice.
                  </td>
                </tr>
              ) : (
                pdfProps.lines.map((line, index) => (
                  <tr key={`${line.name}-${index}`}>
                    <td className="p-3 font-bold text-charcoal">
                      <div>{line.name}</div>
                      {line.comment ? (
                        <div className="mt-1 break-words text-xs font-medium italic leading-5 text-charcoal/60">
                          {line.comment}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-right">{line.quantityLabel}</td>
                    <td className="p-3 text-right font-black text-deep-pine">
                      {line.amount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pdfProps.previouslyInvoiced ? (
          <div className="mt-4 rounded-soft bg-sand/60 p-4 text-sm font-bold text-charcoal/75">
            <div className="flex items-center justify-between gap-4">
              <span>Previously invoiced (Deposit)</span>
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

function InvoiceScopeLine({
  name,
  comment,
  detail,
  total
}: {
  name: string;
  comment: string;
  detail: string;
  total: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="font-bold text-charcoal">{name}</p>
        {comment ? (
          <p className="mt-1 break-words text-xs italic leading-5 text-charcoal/60">
            {comment}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-black text-charcoal">{total}</p>
        <p className="text-xs text-charcoal/55">{detail}</p>
      </div>
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