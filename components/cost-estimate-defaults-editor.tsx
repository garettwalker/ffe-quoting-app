"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  DEFAULT_COST_ESTIMATE_DEFAULTS,
  normalizeDefaults,
  type CostEstimateDefaults
} from "@/lib/cost-estimate";
import { centsToDollars, dollarsToCents } from "@/lib/currency";
import {
  Field,
  SaveNote,
  primaryButtonClass
} from "@/components/pricing-admin-ui";
import type { AppSettings } from "@/lib/types";

// Pricing Admin section for the global cost-estimate defaults: wire cost per
// roll, roll lengths, the feet-per-sqft heuristic ratios, the default adder %,
// and the default hourly labor rate. These seed each new job's cost estimate;
// every one is overridable per job on the Job P&L page. Saved to
// app_settings.cost_estimate_defaults (JSONB) via upsert on the id=1 row —
// upsert touches only the provided column, so the business-info fields set by
// SettingsEditor keep their values. INTERNAL ONLY.

const supabase = getSupabaseBrowser();

type WireDefault = CostEstimateDefaults["wireDefaults"][number];

export function CostEstimateDefaultsEditor({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const [defaults, setDefaults] = useState<CostEstimateDefaults>(
    normalizeDefaults(settings.costEstimateDefaults)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  function updateWire(index: number, field: keyof WireDefault, value: number) {
    setDefaults((prev) => ({
      ...prev,
      wireDefaults: prev.wireDefaults.map((w, i) =>
        i === index ? { ...w, [field]: Math.max(0, value) } : w
      )
    }));
  }

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { id: 1, cost_estimate_defaults: defaults },
        { onConflict: "id" }
      );
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    note("Cost defaults saved. New jobs will seed from these.");
    setIsError(false);
    router.refresh();
  }

  function resetToBuiltIn() {
    setDefaults({
      wireDefaults: DEFAULT_COST_ESTIMATE_DEFAULTS.wireDefaults.map((w) => ({ ...w })),
      defaultAdderPercent: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultAdderPercent,
      defaultHourlyRateCents: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultHourlyRateCents
    });
    note("Reset to built-in defaults (Chad's numbers). Save to keep them.");
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Cost Estimate Defaults · Internal
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Default wire costs, adder %, and labor rate
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          These seed each new job&apos;s cost estimate (the Job P&amp;L page).
          Every number is overridable per job. The feet-per-sqft ratio sets the
          starting wire footage from the quote&apos;s square footage.
        </p>
      </div>

      <div className="grid gap-6">
        <div className="responsive-table-wrap">
          <table className="responsive-table w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                <th className="py-2 pr-3 font-black">Gauge</th>
                <th className="py-2 pr-3 font-black">Roll length (ft)</th>
                <th className="py-2 pr-3 font-black">$/roll</th>
                <th className="py-2 font-black">Ft per sqft</th>
              </tr>
            </thead>
            <tbody>
              {defaults.wireDefaults.map((w, i) => (
                <tr key={w.gauge} className="border-b border-pine/10">
                  <td className="py-3 pr-3 font-black text-deep-pine">{w.gauge}</td>
                  <td className="py-3 pr-3">
                    <input
                      type="number"
                      min={0}
                      value={w.rollLengthFt}
                      onChange={(e) => updateWire(i, "rollLengthFt", Number(e.target.value))}
                      className="form-input w-28"
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={centsToDollars(w.costPerRollCents)}
                      onChange={(e) =>
                        updateWire(i, "costPerRollCents", dollarsToCents(Number(e.target.value)))
                      }
                      className="form-input w-28"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={w.feetPerSqft}
                      onChange={(e) => updateWire(i, "feetPerSqft", Number(e.target.value))}
                      className="form-input w-28"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default adder %">
            <input
              type="number"
              min={0}
              value={defaults.defaultAdderPercent}
              onChange={(e) =>
                setDefaults((prev) => ({
                  ...prev,
                  defaultAdderPercent: Math.max(0, Number(e.target.value))
                }))
              }
              className="form-input w-28"
            />
          </Field>
          <Field label="Default hourly labor rate ($/hr)">
            <input
              type="number"
              min={0}
              step="0.5"
              value={centsToDollars(defaults.defaultHourlyRateCents)}
              onChange={(e) =>
                setDefaults((prev) => ({
                  ...prev,
                  defaultHourlyRateCents: Math.max(0, dollarsToCents(Number(e.target.value)))
                }))
              }
              className="form-input w-28"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={save} disabled={isSaving} className={primaryButtonClass}>
            Save cost defaults
          </button>
          <button
            type="button"
            onClick={resetToBuiltIn}
            className="rounded-full border border-pine/20 bg-whitewarm px-5 py-3 text-sm font-black text-deep-pine hover:bg-pine/10"
          >
            Reset to Chad's defaults
          </button>
          <SaveNote message={message} isError={isError} />
        </div>
      </div>
    </section>
  );
}