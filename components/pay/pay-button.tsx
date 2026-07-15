"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/currency";

// Client button on the public /pay page. Posts the signed token to
// /api/create-checkout-session, which reads the invoice + amount from the
// database (never from the browser) and returns either a Stripe Checkout URL to
// redirect to or a "not configured yet" status. Until Stripe is wired (step 3),
// clicking shows an honest "online payment is being set up" message so a
// customer is never sent to a dead end.
export function PayButton({ token, amountCents }: { token: string; amountCents: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "not-configured" | "error">("idle");
  const [error, setError] = useState("");

  async function handleClick() {
    if (status === "loading") return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; url: string }
        | { ok: false; configured?: boolean; error?: string }
        | null;
      if (!data) {
        setStatus("error");
        setError("No response from the server. Please try again.");
        return;
      }
      if (data.ok) {
        if (data.url) window.location.href = data.url;
        return;
      }
      if (data.configured === false) {
        setStatus("not-configured");
        return;
      }
      setStatus("error");
      setError(data.error || `Could not start payment (status ${res.status}).`);
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  if (status === "not-configured") {
    return (
      <div className="rounded-xl1 border border-pine/10 bg-sand/60 p-4 text-sm font-bold leading-6 text-charcoal/80">
        Online payment is being set up and is not available just yet. Please pay by
        the method shown on your invoice, or contact us to pay over the phone.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="rounded-full bg-pine px-6 py-3 text-center font-black text-whitewarm shadow-card transition hover:bg-deep-pine disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Starting payment..." : `Pay ${formatCurrency(amountCents)}`}
      </button>
      {status === "error" ? (
        <p className="text-sm font-bold text-clay" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}