"use client";

import { useState } from "react";
import type { EmailDocKind, InvoiceKind } from "@/lib/send-pdf-email";

type EmailPdfButtonProps = {
  doc: EmailDocKind;
  id: string;
  invoiceKind?: InvoiceKind;
  defaultTo: string;
  defaultSubject: string;
  defaultMessage: string;
  docTitle: string; // shown in the success message, e.g. "Detailed Quote"
};

type Status = "idle" | "sending" | "sent" | "error";

// "Email PDF" button that opens a small inline panel (To / Subject / Message,
// pre-filled from the email on file) and posts to /api/email-pdf. The server
// renders the same PDF buffer the Download button uses, so the attachment
// matches the download byte-for-byte. Sits next to the Download anchor in
// PdfActionBar. Client-only because it manages form state + a fetch call.
export function EmailPdfButton({
  doc,
  id,
  invoiceKind,
  defaultTo,
  defaultSubject,
  defaultMessage,
  docTitle
}: EmailPdfButtonProps) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [sentTo, setSentTo] = useState<string>("");

  const toValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const canSend = status !== "sending" && toValid && subject.trim().length > 0;

  function handleReset() {
    setOpen(false);
    setStatus("idle");
    setError("");
    setSentTo("");
    setTo(defaultTo);
    setSubject(defaultSubject);
    setMessage(defaultMessage);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/email-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          doc,
          invoiceKind,
          to: to.trim(),
          subject: subject.trim(),
          message
        })
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; id: string }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !data || !data.ok) {
        const msg =
          (data && "error" in data && data.error) ||
          `Send failed (status ${res.status}).`;
        setStatus("error");
        setError(msg);
        return;
      }
      setSentTo(to.trim());
      setStatus("sent");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl1 border border-pine/10 bg-cream p-4 text-sm">
        <p className="font-black text-deep-pine">
          {docTitle} sent to {sentTo}.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="mt-2 rounded-full border border-pine/20 px-4 py-1 text-xs font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-full bg-pine px-6 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
      >
        Email PDF
      </button>

      {open ? (
        <form
          onSubmit={handleSend}
          className="w-full max-w-md rounded-xl1 border border-pine/10 bg-whitewarm p-4 shadow-soft"
        >
          <div className="mb-3">
            <label className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-clay">
              To
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@email.com"
              className="w-full rounded-soft border border-pine/20 px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-pine/40"
              required
              autoComplete="email"
            />
            {to.length > 0 && !toValid ? (
              <p className="mt-1 text-xs font-bold text-clay">
                Enter a valid email address.
              </p>
            ) : null}
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-clay">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-soft border border-pine/20 px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-pine/40"
              required
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-clay">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full rounded-soft border border-pine/20 px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-pine/40"
            />
          </div>

          {status === "error" ? (
            <p className="mb-3 text-sm font-bold text-clay" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-pine/20 px-4 py-2 text-sm font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-full bg-pine px-6 py-2 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}