"use client";

import { useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Customer, CustomerEmail } from "@/lib/types";

// Smart-search Builder / Customer field. Replaces the plain <input> on the
// quote builder with a type-ahead dropdown (mirrors the CatalogPicker pattern:
// input + absolutely-positioned dropdown + 150ms blur-delay + Escape/Enter).
// The input is controlled by the parent's clientName; this component owns only
// the open/closed dropdown and the inline create-new insert.
//
// Three flows:
//  1. Pick existing -> onSelect(customer) (parent sets name + primary email +
//     customerId).
//  2. Type an unknown name -> "Create new customer" item inserts a row via the
//     authenticated browser client and calls onCreated(customer) (parent sets
//     name + customerId; the client email, if any, seeds the new record).
//  3. Edit the name away from the linked customer's name -> the parent clears
//     customerId (it knows the link); this component just reports the change.
//
// A quote with no customer record is valid; the parent leaves customerId
// undefined and this field behaves as free text with optional suggestions.

type CustomerPickerProps = {
  customers: Customer[];
  value: string; // current clientName (controlled)
  customerId?: string; // currently linked customer id (highlighted in list)
  clientEmail?: string; // current clientEmail; seeds a created customer's emails
  onChange: (name: string) => void;
  onSelect: (customer: Customer) => void;
  onCreated: (customer: Customer) => void;
};

// Coerce the raw JSONB emails array returned from Supabase into the CustomerEmail
// shape (defensive; the insert always writes objects). Inlined here rather than
// imported from lib/customers so this client component does not pull the
// server-only supabase-server module into the browser bundle.
function coerceEmails(raw: unknown): CustomerEmail[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomerEmail[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) out.push({ email: trimmed });
      continue;
    }
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const email = typeof obj.email === "string" ? obj.email.trim() : "";
      if (!email) continue;
      out.push({ email });
    }
  }
  return out;
}

export function CustomerPicker({
  customers,
  value,
  customerId,
  clientEmail,
  onChange,
  onSelect,
  onCreated
}: CustomerPickerProps) {
  const supabase = getSupabaseBrowser();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = value.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.emails.some((e) => e.email.toLowerCase().includes(q))
    );
  }, [customers, q]);

  // Suppress "Create new" when the typed name already matches an existing
  // customer exactly (case-insensitive) — the user should pick the existing row
  // instead of making a duplicate. Only offer create-new for a genuinely new
  // name (and only when something is actually typed).
  const exactMatch = useMemo(
    () =>
      q
        ? customers.some((c) => c.name.toLowerCase() === q)
        : false,
    [customers, q]
  );

  function clearBlur() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }

  // Delay closing on blur so a click on a result registers before the list
  // disappears (mirrors CatalogPicker).
  function scheduleClose() {
    clearBlur();
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  }

  function handlePick(customer: Customer) {
    onSelect(customer);
    setOpen(false);
    setError("");
  }

  async function handleCreate() {
    if (creating) return;
    const name = value.trim();
    if (!name) return;
    setCreating(true);
    setError("");
    const emails =
      clientEmail && clientEmail.trim()
        ? [{ email: clientEmail.trim() }]
        : [];
    const { data, error } = await supabase
      .from("customers")
      .insert({ name, emails })
      .select("id, name, emails, phone, note, active, created_at, updated_at")
      .single();
    setCreating(false);
    if (error || !data) {
      setError(error ? error.message : "Could not create the customer.");
      return;
    }
    const row = data as {
      id: string;
      name: string;
      emails: unknown;
      phone: string | null;
      note: string | null;
      active: boolean;
      created_at: string;
      updated_at: string;
    };
    onCreated({
      id: row.id,
      name: row.name,
      emails: coerceEmails(row.emails),
      phone: row.phone,
      note: row.note,
      active: row.active,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      // Enter on a single matched customer picks it; otherwise, if a new name is
      // typed, Enter creates it. Prevents form submit while typing in the field.
      e.preventDefault();
      if (filtered.length === 1) {
        handlePick(filtered[0]);
      } else if (value.trim() && !exactMatch) {
        handleCreate();
      }
    }
  }

  const showCreate = value.trim().length > 0 && !exactMatch;
  const showEmpty = filtered.length === 0 && !showCreate;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          clearBlur();
          setOpen(true);
        }}
        onBlur={scheduleClose}
        onKeyDown={onKeyDown}
        placeholder="Who is billed (builder or direct customer)"
        aria-label="Builder or customer"
        className="form-input"
        autoComplete="off"
      />

      {open && (filtered.length > 0 || showCreate) ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-soft border border-pine/15 bg-whitewarm shadow-soft">
          {filtered.map((customer) => {
            const linked = customer.id === customerId;
            const primary = customer.emails[0]?.email;
            return (
              <button
                type="button"
                key={customer.id}
                // Prevent blur from closing the menu before the click fires.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(customer)}
                className="flex w-full items-center justify-between gap-3 border-b border-pine/8 px-4 py-3 text-left last:border-b-0 hover:bg-cream"
              >
                <span className="min-w-0">
                  <span className="block truncate font-black text-deep-pine">
                    {customer.name}
                    {linked ? (
                      <span className="ml-2 text-xs font-bold text-clay">
                        Linked
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs font-bold text-charcoal/55">
                    {primary
                      ? customer.emails.length > 1
                        ? `${primary} +${customer.emails.length - 1} more`
                        : primary
                      : customer.phone
                        ? customer.phone
                        : "No email on file"}
                  </span>
                </span>
              </button>
            );
          })}

          {showCreate ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreate}
              disabled={creating}
              className="flex w-full items-center gap-2 border-t border-pine/15 px-4 py-3 text-left font-black text-clay hover:bg-clay/10 disabled:opacity-60"
            >
              {creating ? "Creating..." : `Create new customer: ${value.trim()}`}
            </button>
          ) : null}
        </div>
      ) : null}

      {showEmpty && open ? (
        <div className="absolute z-30 mt-1 w-full rounded-soft border border-pine/15 bg-whitewarm px-4 py-3 text-sm font-bold text-charcoal/55 shadow-soft">
          No customer matches. Type a name to create one.
        </div>
      ) : null}

      {error ? (
        <p className="mt-1 text-xs font-bold text-clay">{error}</p>
      ) : null}
    </div>
  );
}