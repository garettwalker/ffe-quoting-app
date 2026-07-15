"use client";

import { useState } from "react";

// Admin-only affordance on the invoicing page. The server mints the signed pay
// URL (needs PAY_LINK_SECRET, server-only) and passes it down; this client
// component just copies it to the clipboard and offers a preview link so the
// owner can see exactly what a customer sees at /pay/[token]. The link is only
// shown when the pay-link chain is ready (PAY_LINK_SECRET + APP_URL are set), so
// nothing renders in step 2 until the owner adds those env vars.
export function CopyPayLinkButton({ payUrl }: { payUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail in non-secure contexts; leave the URL selectable
      // via the preview link as a fallback.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-full border border-pine/20 px-4 py-2 text-sm font-black text-deep-pine transition hover:bg-pine hover:text-whitewarm"
      >
        {copied ? "Copied!" : "Copy payment link"}
      </button>
      <a
        href={payUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full border border-pine/20 px-4 py-2 text-sm font-black text-deep-pine transition hover:bg-pine hover:text-whitewarm"
      >
        Preview
      </a>
    </div>
  );
}