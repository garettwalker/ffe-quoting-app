import Image from "next/image";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSettings } from "@/lib/pricing";
import { formatCurrency } from "@/lib/currency";
import { findInvoice, invoiceReference } from "@/lib/invoice-calculations";
import { ACH_LIMIT_CENTS } from "@/lib/payments";
import { verifyPayToken } from "@/lib/pay-token";
import type { InvoiceData, InvoiceKind, QuoteFormState } from "@/lib/types";
import { PayButton } from "@/components/pay/pay-button";

// Public, unauthenticated customer payment page. The link in an invoice email
// lands here. The token (HMAC-signed, see lib/pay-token.ts) identifies one
// invoice on one quote; this page re-reads that invoice from the database via
// the service-role client (the page has no user session and RLS is admin-only,
// so the browser client would see nothing). The amount shown and charged is
// always what's in our DB — never the token, never the browser.

type QuoteRow = {
  id: string;
  quote_id: string;
  quote_data: QuoteFormState;
  invoice_data: InvoiceData | null;
};

type PageProps = {
  params: { token: string };
};

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: PageProps) {
  const decoded = decodeURIComponent(params.token);
  const verified = verifyPayToken(decoded);
  if (!verified) {
    return <InvalidLink />;
  }

  const supabase = getSupabaseAdmin();
  const [quoteResult, settings] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_id, quote_data, invoice_data")
      .eq("id", verified.quoteUuid)
      .single(),
    getSettings()
  ]);

  const data = quoteResult.data as QuoteRow | null;
  if (quoteResult.error || !data || !data.quote_data || !data.invoice_data) {
    return <InvalidLink />;
  }

  const row = data;
  const invoiceData = data.invoice_data as InvoiceData;
  const invoice = findInvoice(invoiceData, verified.kind);
  if (!invoice) {
    return <InvalidLink />;
  }

  const reference = invoiceReference(row.quote_id, verified.kind);
  const amountCents = Math.round(invoice.amountCents) || 0;
  const isPaid = invoice.status === "paid";
  const businessName = settings.businessName || "Freedom Family Electric";

  if (isPaid) {
    return (
      <PayShell businessName={businessName}>
        <p className="font-display text-3xl font-bold text-moss">Thank you</p>
        <p className="mt-3 text-charcoal/80">
          Invoice <span className="font-black text-deep-pine">{reference}</span> is
          already marked paid. If you have any questions, reply to your email or
          contact us at{" "}
          <span className="font-bold text-deep-pine">{settings.businessEmail}</span>.
        </p>
      </PayShell>
    );
  }

  if (amountCents <= 0) {
    return (
      <PayShell businessName={businessName}>
        <p className="font-display text-3xl font-bold text-moss">{reference}</p>
        <p className="mt-3 text-charcoal/80">
          There is no balance due on this invoice. If you believe this is an error,
          contact us at{" "}
          <span className="font-bold text-deep-pine">{settings.businessEmail}</span>.
        </p>
      </PayShell>
    );
  }

  const title =
    verified.kind === "initial" ? "Invoice 1: Rough-In (Initial)" : "Invoice 2: Finish";

  return (
    <PayShell businessName={businessName}>
      <div className="flex flex-col gap-6 border-b border-pine/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Image
            src="/ffe-logo.png"
            alt={`${businessName} logo`}
            width={56}
            height={56}
            priority
            className="h-14 w-14 rounded-full object-contain"
          />
          <div>
            <p className="font-display text-xl font-bold text-deep-pine">{businessName}</p>
            <p className="text-sm font-bold text-charcoal/70">{settings.businessEmail}</p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-display text-2xl font-bold tracking-[-0.03em] text-moss">
            Pay Invoice
          </p>
          <p className="mt-1 text-sm font-black text-deep-pine">{reference}</p>
        </div>
      </div>

      <div className="py-6">
        <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">Bill To</p>
        <p className="font-black text-deep-pine">{row.quote_data.clientName || "Client"}</p>
        <p className="mt-4 mb-1 text-xs font-black uppercase tracking-[0.12em] text-clay">
          Invoice
        </p>
        <p className="font-bold text-charcoal">{title}</p>
      </div>

      <div className="rounded-xl1 border border-pine/15 bg-cream px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-black uppercase tracking-[0.12em] text-clay">Amount Due</p>
          <p className="font-display text-2xl font-bold text-deep-pine">
            {formatCurrency(amountCents)}
          </p>
        </div>
      </div>

      {amountCents > ACH_LIMIT_CENTS ? (
        <div className="mt-6 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/80">
          This invoice is above the {formatCurrency(ACH_LIMIT_CENTS).replace(/\.00$/, "")} ACH
          bank-transfer limit, so online payment is by card only. You can also
          mail a check (the mailing address is on the invoice).
        </div>
      ) : null}

      <div className="mt-6">
        <PayButton token={decoded} amountCents={amountCents} />
      </div>

      {settings.invoicePaymentTerms ? (
        <div className="mt-6 rounded-soft bg-sand p-4 text-sm font-bold leading-6 text-charcoal/80">
          {settings.invoicePaymentTerms}
        </div>
      ) : null}
    </PayShell>
  );
}

function PayShell({
  businessName,
  children
}: {
  businessName: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-xl rounded-xl2 border border-pine/10 bg-whitewarm p-8 shadow-soft">
        {children}
      </div>
      <p className="mx-auto mt-6 max-w-xl text-center text-xs font-bold text-charcoal/60">
        {businessName}
      </p>
    </main>
  );
}

function InvalidLink() {
  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-xl rounded-xl2 border border-pine/10 bg-whitewarm p-8 shadow-soft">
        <p className="font-display text-3xl font-bold text-moss">Link invalid</p>
        <p className="mt-3 text-charcoal/80">
          This payment link is invalid, expired, or has already been used. If you
          need help, please contact us directly.
        </p>
      </div>
    </main>
  );
}