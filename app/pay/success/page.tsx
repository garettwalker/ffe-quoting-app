import { getSettings } from "@/lib/pricing";

// Stripe redirects here after a successful Checkout. Stripe itself confirms the
// payment via the signed webhook (the redirect URL can be tampered with, so the
// webhook is the source of truth for flipping the invoice flag + ledger). This
// page just thanks the customer.

export const dynamic = "force-dynamic";

export default async function PaySuccessPage() {
  const settings = await getSettings();
  const businessName = settings.businessName || "Freedom Family Electric";
  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-xl rounded-xl2 border border-pine/10 bg-whitewarm p-8 shadow-soft">
        <p className="font-display text-3xl font-bold text-moss">Thank you</p>
        <p className="mt-3 text-charcoal/80">
          Your payment was received. A confirmation may take a moment to appear on
          your invoice. If you have any questions, contact us at{" "}
          <span className="font-bold text-deep-pine">{settings.businessEmail}</span>.
        </p>
      </div>
      <p className="mx-auto mt-6 max-w-xl text-center text-xs font-bold text-charcoal/60">
        {businessName}
      </p>
    </main>
  );
}