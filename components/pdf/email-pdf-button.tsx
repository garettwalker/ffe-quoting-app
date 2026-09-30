"use client";

import { useState } from "react";
import type { EmailDocKind, InvoiceKind } from "@/lib/send-pdf-email";
import type { CustomerEmail } from "@/lib/types";

type EmailPdfButtonProps = {
  doc: EmailDocKind;
  id: string;
  invoiceKind?: InvoiceKind;
  defaultTo: string;
  defaultSubject: string;
  defaultMessage: string;
  docTitle: string; // shown in the success message, e.g. "Detailed Quote"
  // The linked customer's emails, offered as one-click toggle chips under the
  // To field so both halves of a husband/wife team (or an office contact) can be
  // added to the send without hand-typing a comma. The To field still accepts
  // free text and comma-separated addresses.
  suggestedEmails?: CustomerEmail[];
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
  docTitle,
  suggestedEmails
}: EmailPdfButtonProps) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [sentTo, setSentTo] = useState<string>("");

  // The To field accepts multiple comma-separated recipients. Each must be a
  // valid address; a single bad address rejects the whole send so a typo is
  // never silently dropped.
  const recipients = splitRecipients(to);
  const toValid =
    recipients.length > 0 &&
    recipients.every((addr) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr));
  const canSend = status !== "sending" && toValid && subject.trim().length > 0;

  // The contacts on file, deduped against each other. Matched by lowercased
  // address so a chip reads as selected whether the address was added by
  // clicking it or typed in by hand.
  const contacts = dedupeContacts(suggestedEmails ?? []);
  const selectedKeys = new Set(recipients.map((addr) => addr.toLowerCase()));
  const unselected = contacts.filter(
    (contact) => !selectedKeys.has(contact.email.toLowerCase())
  );

  // Add or remove one contact from the To field. Rebuilds the string from the
  // current list so toggling is reversible and can never duplicate an address.
  function toggleContact(email: string) {
    const key = email.toLowerCase();
    const next = selectedKeys.has(key)
      ? recipients.filter((addr) => addr.toLowerCase() !== key)
      : [...recipients, email];
    setTo(next.join(", "));
  }

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
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@email.com (comma-separate for multiple)"
              className="w-full rounded-soft border border-pine/20 px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-pine/40"
              required
              autoComplete="off"
            />

            {contacts.length > 0 ? (
              <div className="mt-2">
                <p className="mb-1 text-xs font-bold text-charcoal/60">
                  Emails on file for this customer
                </p>
                <div className="flex flex-wrap gap-2">
                  {contacts.map((contact) => {
                    const isSelected = selectedKeys.has(
                      contact.email.toLowerCase()
                    );
                    return (
                      <button
                        key={contact.email}
                        type="button"
                        onClick={() => toggleContact(contact.email)}
                        aria-pressed={isSelected}
                        title={
                          isSelected
                            ? `Remove ${contact.email}`
                            : `Add ${contact.email}`
                        }
                        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-left text-sm font-bold transition ${
                          isSelected
                            ? "border-pine bg-pine text-whitewarm"
                            : "border-pine/25 bg-cream text-deep-pine hover:border-pine hover:bg-pine/10"
                        }`}
                      >
                        <span aria-hidden="true" className="font-black">
                          {isSelected ? "✓" : "+"}
                        </span>
                        {contact.label ? (
                          <span className="font-black uppercase tracking-[0.08em]">
                            {contact.label}
                          </span>
                        ) : null}
                        <span>{contact.email}</span>
                      </button>
                    );
                  })}
                </div>
                {contacts.length > 1 && unselected.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTo(
                        [
                          ...recipients,
                          ...unselected.map((contact) => contact.email)
                        ].join(", ")
                      )
                    }
                    className="mt-2 text-xs font-black text-clay underline decoration-clay/40 decoration-2 underline-offset-4 hover:text-deep-pine"
                  >
                    {unselected.length === 1
                      ? "Add the other email"
                      : `Add the other ${unselected.length} emails`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {to.length > 0 && !toValid ? (
              <p className="mt-1 text-xs font-bold text-clay">
                Enter a valid email address for each recipient (comma-separated).
              </p>
            ) : null}
            {recipients.length > 1 ? (
              <p className="mt-1 text-xs font-bold text-charcoal/60">
                This will send one email to all {recipients.length} addresses.
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

// The To field's addresses, trimmed and without the blanks a trailing comma
// leaves behind.
function splitRecipients(value: string): string[] {
  return value
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);
}

// The customer's emails as offered chips: valid-looking addresses only (a
// half-typed address on the customer record would otherwise be offered as a
// recipient), deduped case-insensitively, since two entries for the same
// address would render as two chips that always move together.
function dedupeContacts(emails: CustomerEmail[]): CustomerEmail[] {
  const seen = new Set<string>();
  const contacts: CustomerEmail[] = [];
  for (const entry of emails) {
    const email = (entry.email ?? "").trim();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = (entry.label ?? "").trim();
    contacts.push(label ? { email, label } : { email });
  }
  return contacts;
}