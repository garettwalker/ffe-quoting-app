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
  primaryButtonClass,
  secondaryButtonClass
} from "@/components/pricing-admin-ui";
import type { AppSettings } from "@/lib/types";

// Pricing Admin section for the global cost-estimate defaults: the names of the
// default material buckets (seed each new job's materials section) and the
// default hourly labor rate (seeds each newly added labor line). Both are
// overridable per job on the Job P&L page. Saved to
// app_settings.cost_estimate_defaults (JSONB) via upsert on the id=1 row —
// upsert touches only the provided column, so the business-info fields set by
// SettingsEditor keep their values. INTERNAL ONLY.

const supabase = getSupabaseBrowser();

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

  function updateBucketName(index: number, name: string) {
    setDefaults((prev) => ({
      ...prev,
      defaultMaterialBuckets: prev.defaultMaterialBuckets.map((b, i) =>
        i === index ? { name } : b
      )
    }));
  }
  function addBucket() {
    setDefaults((prev) => ({
      ...prev,
      defaultMaterialBuckets: [...prev.defaultMaterialBuckets, { name: "" }]
    }));
  }
  function removeBucket(index: number) {
    setDefaults((prev) => ({
      ...prev,
      defaultMaterialBuckets: prev.defaultMaterialBuckets.filter((_, i) => i !== index)
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
      defaultMaterialBuckets: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultMaterialBuckets.map(
        (b) => ({ ...b })
      ),
      defaultHourlyRateCents: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultHourlyRateCents
    });
    note("Reset to built-in defaults (Chad's buckets + $75/hr). Save to keep them.");
  }

  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-card">
      <div className="mb-5">
        <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
          Cost Estimate Defaults · Internal
        </p>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
          Default material buckets and labor rate
        </h2>
        <p className="mt-2 text-sm font-bold text-charcoal/65">
          These seed each new job&apos;s cost estimate (the Job P&amp;L page).
          The bucket names start the materials section at $0 per bucket; the
          labor rate starts each newly added crew line. Everything is overridable
          per job.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Default material bucket names */}
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
              Default material buckets
            </p>
            <button type="button" onClick={addBucket} className={secondaryButtonClass}>
              Add bucket
            </button>
          </div>
          <div className="space-y-2">
            {defaults.defaultMaterialBuckets.map((b, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <Field label="Bucket name">
                  <input
                    value={b.name}
                    onChange={(e) => updateBucketName(i, e.target.value)}
                    placeholder="e.g. Wire"
                    className="form-input min-w-[14rem] flex-1"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => removeBucket(i)}
                  className="mb-3 rounded-full border border-clay/40 px-3 py-2 text-xs font-black text-clay hover:bg-clay/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs font-bold text-charcoal/50">
            The amount for each bucket is filled in per job on the Job P&amp;L
            page. Only the names are set here.
          </p>
        </div>

        {/* Default labor rate */}
        <Field label="Default labor rate ($/hr)">
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

        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={save} disabled={isSaving} className={primaryButtonClass}>
            Save cost defaults
          </button>
          <button
            type="button"
            onClick={resetToBuiltIn}
            className="rounded-full border border-pine/20 bg-whitewarm px-5 py-3 text-sm font-black text-deep-pine hover:bg-pine/10"
          >
            Reset to Chad&apos;s defaults
          </button>
          <SaveNote message={message} isError={isError} />
        </div>
      </div>
    </section>
  );
}