"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  computeCostEstimate,
  marginFor,
  buildDefaultCostEstimate,
  makeMaterialId,
  makeLaborId,
  type CostBasis,
  type CostEstimateData,
  type CostEstimateDefaults,
  type JobPnl,
  type LaborLine
} from "@/lib/cost-estimate";
import { BasisToggle } from "@/components/basis-toggle";
import {
  Field,
  SaveNote,
  primaryButtonClass,
  secondaryButtonClass
} from "@/components/pricing-admin-ui";
import { centsToDollars, dollarsToCents, formatCurrency } from "@/lib/currency";

// Internal — never customer-facing. This is the per-job P&L + cost entry view.
// The owner picks a revenue basis (Contracted / Invoiced / Paid), sees margin,
// and enters the job's cost (materials $ buckets + per-person labor). Costs
// persist to quotes.cost_estimate_data. Margin is derived live from the chosen
// basis. There is no margin markup on the cost side — margin lives on the
// revenue side (the quote's adder line items are priced with margin built in),
// so true margin = revenue - these costs.

const supabase = getSupabaseBrowser();

type JobPnlEditorProps = {
  quoteId: string; // quotes.id (UUID) — the update key
  jobPnl: JobPnl; // precomputed revenue (contracted/invoiced/paid) + default cost
  hasSavedCost: boolean; // a saved estimate exists on the quote
  initialData: CostEstimateData; // saved estimate OR built-from-defaults
  defaults: CostEstimateDefaults; // global defaults, for reset
};

export function JobPnlEditor({
  quoteId,
  jobPnl,
  hasSavedCost,
  initialData,
  defaults
}: JobPnlEditorProps) {
  const router = useRouter();
  const [basis, setBasis] = useState<CostBasis>("invoiced");
  const [data, setData] = useState<CostEstimateData>(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  // Tracks whether the working estimate has real entered cost (saved OR the
  // user is mid-edit). Used to decide whether to flag "default / no cost yet".
  const [enteredCost, setEnteredCost] = useState(hasSavedCost);

  const totals = useMemo(() => computeCostEstimate(data), [data]);

  // Live margin: same revenue basis as the toggle, but cost reflects the
  // working estimate (not the default). hasCost is true once cost is entered
  // or saved.
  const liveJob = useMemo<JobPnl>(
    () => ({
      ...jobPnl,
      costCents: totals.totalJobCostCents,
      hasCost: enteredCost
    }),
    [jobPnl, totals.totalJobCostCents, enteredCost]
  );

  const margin = marginFor(liveJob, basis);

  function note(msg: string, error = false) {
    setMessage(msg);
    setIsError(error);
  }

  // --- materials editors (named $ buckets) ---
  function addMaterial() {
    setData((prev) => ({
      ...prev,
      materials: [
        ...prev.materials,
        { id: makeMaterialId(), name: "", costCents: 0 }
      ]
    }));
    setEnteredCost(true);
  }
  function updateMaterialName(id: string, name: string) {
    setData((prev) => ({
      ...prev,
      materials: prev.materials.map((m) => (m.id === id ? { ...m, name } : m))
    }));
    setEnteredCost(true);
  }
  function updateMaterialCost(id: string, dollars: number) {
    setData((prev) => ({
      ...prev,
      materials: prev.materials.map((m) =>
        m.id === id ? { ...m, costCents: Math.max(0, dollarsToCents(dollars)) } : m
      )
    }));
    setEnteredCost(true);
  }
  function removeMaterial(id: string) {
    setData((prev) => ({
      ...prev,
      materials: prev.materials.filter((m) => m.id !== id)
    }));
    setEnteredCost(true);
  }

  // --- labor editors (per person, hours split rough-in / finish) ---
  function addLaborLine() {
    setData((prev) => ({
      ...prev,
      laborLines: [
        ...prev.laborLines,
        {
          id: makeLaborId(),
          person: "",
          rateCents: defaults.defaultHourlyRateCents,
          roughInHours: 0,
          finishHours: 0
        }
      ]
    }));
    setEnteredCost(true);
  }
  function updateLaborLine(
    id: string,
    field: "person" | "roughInHours" | "finishHours",
    value: string | number
  ) {
    setData((prev) => ({
      ...prev,
      laborLines: prev.laborLines.map((l) =>
        l.id === id
          ? {
              ...l,
              [field]:
                field === "person"
                  ? String(value)
                  : Math.max(0, Number(value) || 0)
            }
          : l
      )
    }));
    setEnteredCost(true);
  }
  function updateLaborRate(id: string, dollars: number) {
    setData((prev) => ({
      ...prev,
      laborLines: prev.laborLines.map((l) =>
        l.id === id ? { ...l, rateCents: Math.max(0, dollarsToCents(dollars)) } : l
      )
    }));
    setEnteredCost(true);
  }
  function removeLaborLine(id: string) {
    setData((prev) => ({
      ...prev,
      laborLines: prev.laborLines.filter((l) => l.id !== id)
    }));
    setEnteredCost(true);
  }
  function lineLaborCost(l: LaborLine): number {
    const rate = Math.max(0, l.rateCents);
    return Math.round(rate * (Math.max(0, l.roughInHours) + Math.max(0, l.finishHours)));
  }

  function resetAllToDefaults() {
    setData(buildDefaultCostEstimate(0, defaults));
    setEnteredCost(false);
    note("Reset to default empty buckets. Save to keep these.");
  }

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    const payload = { ...data, updatedAt: new Date().toISOString() };
    const { error } = await supabase
      .from("quotes")
      .update({ cost_estimate_data: payload })
      .eq("id", quoteId);
    setIsSaving(false);
    if (error) {
      note(`Save failed: ${error.message}`, true);
      return;
    }
    setEnteredCost(true);
    note("Cost estimate saved. Margin is now tracked for this job.");
    router.refresh();
  }

  const revenueLabel =
    basis === "contracted" ? "Contracted (quote total)"
    : basis === "invoiced" ? "Invoiced (billed)"
    : "Paid (cash collected)";

  return (
    <div className="space-y-6">
      {/* P&L summary */}
      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Job P&amp;L
            </p>
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-moss">
              Revenue vs cost
            </h2>
          </div>
          <span className="rounded-full border border-clay/30 bg-clay/10 px-3 py-1 text-xs font-black text-clay">
            Internal — not shown to customer
          </span>
        </div>

        <div className="mb-5">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
            Revenue basis
          </p>
          <BasisToggle value={basis} onChange={setBasis} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <PnlStat label={revenueLabel} value={formatCurrency(margin.revenueCents)} />
          <PnlStat label="Job cost" value={formatCurrency(margin.costCents)} />
          <div className="rounded-xl1 border border-pine/10 bg-cream p-4">
            <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
              Margin
            </p>
            <p
              className={
                margin.marginCents >= 0
                  ? "font-display text-2xl font-bold text-deep-pine"
                  : "font-display text-2xl font-bold text-clay"
              }
            >
              {formatCurrency(margin.marginCents)}
            </p>
            <p
              className={
                margin.marginCents >= 0
                  ? "mt-1 text-sm font-black text-deep-pine"
                  : "mt-1 text-sm font-black text-clay"
              }
            >
              {margin.marginPct}%
            </p>
          </div>
        </div>

        {/* All three revenue figures, for context regardless of the basis. */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs font-bold text-charcoal/60">
          <span>Contracted: <span className="text-charcoal">{formatCurrency(jobPnl.contractedCents)}</span></span>
          <span>Invoiced: <span className="text-charcoal">{formatCurrency(jobPnl.invoicedCents)}</span></span>
          <span>Paid: <span className="text-charcoal">{formatCurrency(jobPnl.paidCents)}</span></span>
        </div>

        {!enteredCost ? (
          <p className="mt-4 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
            No costs entered yet — these are empty default buckets. Enter your
            real material and labor costs below and save to lock in your margin.
          </p>
        ) : null}
      </section>

      {/* Cost entry: materials ($ buckets) */}
      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Materials
            </p>
            <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-moss">
              Material cost buckets
            </h3>
            <p className="mt-1 text-sm font-bold text-charcoal/65">
              One $ amount per category. Defaults match how Chad tracks a job
              (wire / receptacles &amp; boxes / panels &amp; feed wire). Rename,
              add, or remove buckets as needed.
            </p>
          </div>
          <button type="button" onClick={addMaterial} className={secondaryButtonClass}>
            Add bucket
          </button>
        </div>

        <div className="space-y-2">
          {data.materials.map((m) => (
            <div key={m.id} className="flex flex-wrap items-end gap-3">
              <Field label="Bucket">
                <input
                  value={m.name}
                  onChange={(e) => updateMaterialName(m.id, e.target.value)}
                  placeholder="e.g. Wire"
                  className="form-input min-w-[12rem] flex-1"
                />
              </Field>
              <Field label="$ amount">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={centsToDollars(m.costCents)}
                  onChange={(e) => updateMaterialCost(m.id, Number(e.target.value))}
                  className="form-input w-32"
                />
              </Field>
              <p className="pb-3 text-sm font-bold text-charcoal">
                {formatCurrency(m.costCents)}
              </p>
              <button
                type="button"
                onClick={() => removeMaterial(m.id)}
                className="mb-3 rounded-full border border-clay/40 px-3 py-2 text-xs font-black text-clay hover:bg-clay/10"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-sm font-bold text-charcoal/65">
          Materials subtotal: <span className="text-deep-pine">{formatCurrency(totals.materialsCostCents)}</span>
        </p>
      </section>

      {/* Cost entry: labor (per person, rough-in / finish) */}
      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Labor
            </p>
            <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-moss">
              Crew hours by phase
            </h3>
            <p className="mt-1 text-sm font-bold text-charcoal/65">
              One line per person. Hours split across rough-in and finish because
              of the gap while sheetrock goes up. Line cost = rate x (rough-in + finish).
            </p>
          </div>
          <button type="button" onClick={addLaborLine} className={secondaryButtonClass}>
            Add person
          </button>
        </div>

        <div className="responsive-table-wrap rounded-xl1 border border-pine/10">
          <table className="responsive-table w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                <th className="p-3 font-black">Person</th>
                <th className="p-3 font-black">$/hr</th>
                <th className="p-3 font-black">Rough-in hrs</th>
                <th className="p-3 font-black">Finish hrs</th>
                <th className="p-3 font-black">Line cost</th>
                <th className="p-3 font-black" aria-label="Remove line" />
              </tr>
            </thead>
            <tbody>
              {data.laborLines.map((l) => (
                <tr key={l.id} className="border-b border-pine/10">
                  <td className="p-2">
                    <input
                      value={l.person}
                      onChange={(e) => updateLaborLine(l.id, "person", e.target.value)}
                      placeholder="e.g. Chad"
                      className="form-input min-w-[8rem]"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={centsToDollars(l.rateCents)}
                      onChange={(e) => updateLaborRate(l.id, Number(e.target.value))}
                      className="form-input w-20"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={l.roughInHours}
                      onChange={(e) => updateLaborLine(l.id, "roughInHours", Number(e.target.value))}
                      className="form-input w-20"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={l.finishHours}
                      onChange={(e) => updateLaborLine(l.id, "finishHours", Number(e.target.value))}
                      className="form-input w-20"
                    />
                  </td>
                  <td className="p-3 font-black text-deep-pine">
                    {formatCurrency(lineLaborCost(l))}
                  </td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLaborLine(l.id)}
                      className="rounded-full border border-clay/40 px-3 py-1 text-xs font-black text-clay hover:bg-clay/10"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid gap-2 rounded-xl1 border border-pine/10 bg-cream p-4 text-sm font-bold text-charcoal/70 sm:grid-cols-3">
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <span>Rough-in labor</span>
            <span className="font-black text-deep-pine">{formatCurrency(totals.roughInLaborCents)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <span>Finish labor</span>
            <span className="font-black text-deep-pine">{formatCurrency(totals.finishLaborCents)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <span>Labor total</span>
            <span className="font-black text-deep-pine">{formatCurrency(totals.laborCostCents)}</span>
          </div>
        </div>

        {/* Total job cost */}
        <div className="mt-6 rounded-xl1 border border-pine/10 bg-cream p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-charcoal/70">
            <span>Materials</span>
            <span>{formatCurrency(totals.materialsCostCents)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-charcoal/70">
            <span>+ Labor</span>
            <span>{formatCurrency(totals.laborCostCents)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-pine/15 pt-2">
            <span className="font-black text-deep-pine">Total job cost</span>
            <span className="font-display text-xl font-bold text-moss">
              {formatCurrency(totals.totalJobCostCents)}
            </span>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={isSaving} className={primaryButtonClass}>
          Save cost estimate
        </button>
        <button type="button" onClick={resetAllToDefaults} className={secondaryButtonClass}>
          Reset all to defaults
        </button>
        <SaveNote message={message} isError={isError} />
      </div>
    </div>
  );
}

function PnlStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl1 border border-pine/10 bg-whitewarm p-4">
      <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
        {label}
      </p>
      <p className="font-display text-2xl font-bold text-charcoal">{value}</p>
    </div>
  );
}