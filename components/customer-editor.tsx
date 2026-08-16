"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Customer } from "@/lib/types";
import {
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass
} from "@/components/pricing-admin-ui";

// Inline editor for a single customer record, shown on the customer detail
// page. Edits name, the email list (add/remove rows, each with an optional
// label like "Sam" / "Jane"), phone, and a note. Saves via the authenticated
// browser client (RLS-enforced, admin-only) then router.refresh() so the detail
// page re-reads from the DB. Mirrors the base-rate-editor / settings-editor
// pattern. Editing a customer changes future quotes' autofill only; existing
// quotes keep their own client_name / client_email snapshot.

const supabase = getSupabaseBrowser();

type EmailDraft = { email: string; label: string };

export function CustomerEditor({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [name, setName] = useState(customer.name);
  const [emails, setEmails] = useState<EmailDraft[]>(
    customer.emails.length > 0
      ? customer.emails.map((e) => ({
          email: e.email,
          label: e.label ?? ""
        }))
      : [{ email: "", label: "" }]
  );
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [note, setNote] = useState(customer.note ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function notify(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  function updateEmail(index: number, patch: Partial<EmailDraft>) {
    setEmails((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function addEmail() {
    setEmails((rows) => [...rows, { email: "", label: "" }]);
  }

  function removeEmail(index: number) {
    setEmails((rows) => rows.filter((_, i) => i !== index));
  }

  async function save() {
    if (isSaving) return;
    if (!name.trim()) {
      notify("Name is required.", true);
      return;
    }
    const cleanEmails = emails
      .map((row) => ({
        email: row.email.trim(),
        label: row.label.trim()
      }))
      .filter((row) => row.email);
    if (cleanEmails.some((row) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) {
      notify("One or more email addresses are not valid.", true);
      return;
    }
    setIsSaving(true);
    const payload = {
      name: name.trim(),
      emails: cleanEmails.map((row) =>
        row.label ? { email: row.email, label: row.label } : { email: row.email }
      ),
      phone: phone.trim() || null,
      note: note.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", customer.id);
    setIsSaving(false);
    if (error) {
      notify(`Save failed: ${error.message}`, true);
      return;
    }
    notify("Customer saved.");
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Edit customer
        </p>
        <p className="text-sm font-bold text-charcoal/65">
          Changes here update the customer record and future quotes that pick
          it. Existing quotes keep their own name and email snapshot.
        </p>
      </div>

      <div className="grid gap-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="form-input"
            placeholder="Builder or customer name"
          />
        </Field>

        <div>
          <p className="mb-1 text-sm font-black text-deep-pine">Emails</p>
          <p className="mb-3 text-xs font-bold text-charcoal/55">
            Add more than one for a husband/wife team (or any second contact).
            The first email autofills a new quote; the billing recipient is
            chosen at send time.
          </p>
          <div className="space-y-2">
            {emails.map((row, index) => (
              <div key={index} className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={row.email}
                  onChange={(e) => updateEmail(index, { email: e.target.value })}
                  className="form-input min-w-40 flex-1"
                  placeholder="email@example.com"
                />
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateEmail(index, { label: e.target.value })}
                  className="form-input w-32"
                  placeholder="Label (e.g. Sam)"
                />
                <button
                  type="button"
                  onClick={() => removeEmail(index)}
                  className="rounded-full border border-pine/20 px-4 py-2 text-xs font-black text-clay hover:bg-clay/10"
                  aria-label="Remove email"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addEmail}
            className={secondaryButtonClass + " mt-3"}
          >
            Add email
          </button>
        </div>

        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="form-input"
            placeholder="Optional phone number"
          />
        </Field>

        <Field label="Note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="form-input min-h-24 resize-y py-3"
            placeholder="Optional internal note about this customer"
          />
        </Field>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className={primaryButtonClass}
          >
            {isSaving ? "Saving..." : "Save customer"}
          </button>
        </div>

        <SaveNote message={message} isError={isError} />
      </div>
    </section>
  );
}