import { getSettings } from "@/lib/pricing";

// Stripe redirects here if the customer closes Checkout without paying. No state
// changes on our side (the invoice stays unpaid); just acknowledge it.

export const dynamic = "force-dynamic";

export default async function PayCanceledPage() {
  const settings = await getSettings();
  const businessName = settings.businessName || "Freedom Family Electric";
  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-xl rounded-xl2 border border-pine/10 bg-whitewarm p-8 shadow-soft">
        <p className="font-display text-3xl font-bold text-moss">Payment canceled</p>
        <p className="mt-3 text-charcoal/80">
          Your payment was not completed. No charge was made. You can use the link
          in your invoice email to try again anytime, or contact us at{" "}
          <span className="font-bold text-deep-pine">{settings.businessEmail}</span>.
        </p>
      </div>
      <p className="mx-auto mt-6 max-w-xl text-center text-xs font-bold text-charcoal/60">
        {businessName}
      </p>
    </main>
  );
}