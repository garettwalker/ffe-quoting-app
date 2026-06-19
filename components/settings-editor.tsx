"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AppSettings } from "@/lib/types";
import {
  Field,
  SaveNote,
  primaryButtonClass
} from "@/components/pricing-admin-ui";

type SettingsEditorProps = {
  settings: AppSettings;
};

export function SettingsEditor({ settings }: SettingsEditorProps) {
  const router = useRouter();

  const [businessName, setBusinessName] = useState(settings.businessName);
  const [businessEmail, setBusinessEmail] = useState(settings.businessEmail);
  const [businessTagline, setBusinessTagline] = useState(
    settings.businessTagline
  );
  const [defaultQuoteNotes, setDefaultQuoteNotes] = useState(
    settings.defaultQuoteNotes
  );
  const [invoicePaymentTerms, setInvoicePaymentTerms] = useState(
    settings.invoicePaymentTerms
  );

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        business_name: businessName,
        business_email: businessEmail,
        business_tagline: businessTagline,
        default_quote_notes: defaultQuoteNotes,
        invoice_payment_terms: invoicePaymentTerms
      })
      .eq("id", 1);
    setIsSaving(false);
    if (error) {
      setMessage(`Save failed: ${error.message}`);
      setIsError(true);
      return;
    }
    setMessage("Settings saved. Printable quotes and invoices now use these.");
    setIsError(false);
    router.refresh();
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Business Info
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Business info and quote/invoice text
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          Shown on every printable quote, summary, and invoice. Saved quotes
          keep their line-item snapshots, but this text always reads live.
        </p>
      </div>

      <div className="grid gap-4">
        <Field label="Business name">
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="form-input"
          />
        </Field>
        <Field label="Business email">
          <input
            type="email"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
            className="form-input"
          />
        </Field>
        <Field label="Business tagline">
          <input
            value={businessTagline}
            onChange={(e) => setBusinessTagline(e.target.value)}
            className="form-input"
          />
        </Field>
        <Field label="Default quote notes">
          <textarea
            value={defaultQuoteNotes}
            onChange={(e) => setDefaultQuoteNotes(e.target.value)}
            rows={5}
            className="form-input"
          />
        </Field>
        <Field label="Invoice payment terms">
          <textarea
            value={invoicePaymentTerms}
            onChange={(e) => setInvoicePaymentTerms(e.target.value)}
            rows={4}
            className="form-input"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className={primaryButtonClass}
          >
            Save settings
          </button>
          <SaveNote message={message} isError={isError} />
        </div>
      </div>
    </section>
  );
}