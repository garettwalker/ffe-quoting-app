"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  computeCostEstimate,
  marginFor,
  buildDefaultCostEstimate,
  makeDeviceId,
  type CostBasis,
  type CostEstimateData,
  type CostEstimateDefaults,
  type JobPnl
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
// and enters the job's cost (wire / devices / adders / labor). Costs persist to
// quotes.cost_estimate_data. Margin is derived live from the chosen basis.

const supabase = getSupabaseBrowser();

type JobPnlEditorProps = {
  quoteId: string; // quotes.id (UUID) — the update key
  sqft: number; // for the "reset wire to sqft" heuristic
  jobPnl: JobPnl; // precomputed revenue (contracted/invoiced/paid) + default cost
  hasSavedCost: boolean; // a saved estimate exists on the quote
  initialData: CostEstimateData; // saved estimate OR built-from-sqft default
  defaults: CostEstimateDefaults; // global defaults, for reset
};

export function JobPnlEditor({
  quoteId,
  sqft,
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

  // --- wire editors ---
  function updateWire(index: number, field: "feet" | "rollLengthFt", value: number) {
    setData((prev) => {
      const wire = prev.wire.map((row, i) =>
        i === index ? { ...row, [field]: Math.max(0, value) } : row
      );
      return { ...prev, wire };
    });
    setEnteredCost(true);
  }
  function updateWireCost(index: number, dollars: number) {
    setData((prev) => {
      const wire = prev.wire.map((row, i) =>
        i === index ? { ...row, costPerRollCents: Math.max(0, dollarsToCents(dollars)) } : row
      );
      return { ...prev, wire };
    });
    setEnteredCost(true);
  }
  function resetWireToHeuristic() {
    const fresh = buildDefaultCostEstimate(sqft, defaults);
    setData((prev) => ({ ...prev, wire: fresh.wire }));
    setEnteredCost(true);
  }

  // --- devices editors ---
  function addDevice() {
    setData((prev) => ({
      ...prev,
      devices: [...prev.devices, { id: makeDeviceId(), name: "", quantity: 1, unitCostCents: 0 }]
    }));
    setEnteredCost(true);
  }
  function updateDevice(id: string, field: "name" | "quantity", value: string | number) {
    setData((prev) => ({
      ...prev,
      devices: prev.devices.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    }));
    setEnteredCost(true);
  }
  function updateDeviceCost(id: string, dollars: number) {
    setData((prev) => ({
      ...prev,
      devices: prev.devices.map((d) =>
        d.id === id ? { ...d, unitCostCents: Math.max(0, dollarsToCents(dollars)) } : d
      )
    }));
    setEnteredCost(true);
  }
  function removeDevice(id: string) {
    setData((prev) => ({ ...prev, devices: prev.devices.filter((d) => d.id !== id) }));
    setEnteredCost(true);
  }

  // --- adders + labor ---
  function setAdderPercent(value: number) {
    setData((prev) => ({ ...prev, adderPercent: Math.max(0, value) }));
    setEnteredCost(true);
  }
  function setLaborHours(value: number) {
    setData((prev) => ({ ...prev, laborHours: Math.max(0, value) }));
    setEnteredCost(true);
  }
  function setHourlyRate(dollars: number) {
    setData((prev) => ({ ...prev, hourlyRateCents: Math.max(0, dollarsToCents(dollars)) }));
    setEnteredCost(true);
  }

  function resetAllToDefaults() {
    setData(buildDefaultCostEstimate(sqft, defaults));
    setEnteredCost(false);
    note("Reset to defaults from sqft. Save to keep these.");
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
            These are default cost estimates built from the {Math.round(sqft).toLocaleString()} sqft.
            Enter your real costs below and save to lock in your margin.
          </p>
        ) : null}
      </section>

      {/* Cost entry: wire */}
      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
              Materials
            </p>
            <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-moss">
              Wire
            </h3>
            <p className="mt-1 text-sm font-bold text-charcoal/65">
              Feet are seeded from the sqft heuristic. Rolls = ceil(feet ÷ roll length). Cost = rolls × $/roll.
            </p>
          </div>
          <button
            type="button"
            onClick={resetWireToHeuristic}
            className={secondaryButtonClass}
          >
            Reset wire to sqft
          </button>
        </div>

        <div className="responsive-table-wrap">
          <table className="responsive-table w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-pine/15 text-left text-xs font-black uppercase tracking-[0.12em] text-charcoal/60">
                <th className="py-2 pr-3 font-black">Gauge</th>
                <th className="py-2 pr-3 font-black">Feet</th>
                <th className="py-2 pr-3 font-black">Roll length (ft)</th>
                <th className="py-2 pr-3 font-black">$/roll</th>
                <th className="py-2 pr-3 font-black">Rolls</th>
                <th className="py-2 font-black">Line cost</th>
              </tr>
            </thead>
            <tbody>
              {data.wire.map((row, i) => {
                const rolls = row.rollLengthFt > 0 ? Math.ceil(row.feet / row.rollLengthFt) : 0;
                const lineCost = rolls * row.costPerRollCents;
                return (
                  <tr key={row.gauge} className="border-b border-pine/10">
                    <td className="py-3 pr-3 font-black text-deep-pine">{row.gauge}</td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={row.feet}
                        onChange={(e) => updateWire(i, "feet", Number(e.target.value))}
                        className="form-input w-24"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={row.rollLengthFt}
                        onChange={(e) => updateWire(i, "rollLengthFt", Number(e.target.value))}
                        className="form-input w-24"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={centsToDollars(row.costPerRollCents)}
                        onChange={(e) => updateWireCost(i, Number(e.target.value))}
                        className="form-input w-24"
                      />
                    </td>
                    <td className="py-3 pr-3 font-bold text-charcoal">{rolls}</td>
                    <td className="py-3 font-bold text-charcoal">{formatCurrency(lineCost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm font-bold text-charcoal/65">
          Wire subtotal: <span className="text-deep-pine">{formatCurrency(totals.wireCostCents)}</span>
        </p>
      </section>

      {/* Cost entry: devices */}
      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        <div className="mb-4">
          <p className="mb-1 text-sm font-black uppercase tracking-[0.16em] text-clay">
            Materials
          </p>
          <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-moss">
            Outlets / devices
          </h3>
          <p className="mt-1 text-sm font-bold text-charcoal/65">
            Receptacles, switches, fixtures, etc. Add a line per device type.
          </p>
        </div>

        {data.devices.length === 0 ? (
          <p className="rounded-xl1 border border-pine/10 bg-cream p-4 text-sm font-bold text-charcoal/60">
            No devices added yet.
          </p>
        ) : (
          <div className="space-y-2">
            {data.devices.map((d) => (
              <div key={d.id} className="flex flex-wrap items-end gap-3">
                <Field label="Device">
                  <input
                    value={d.name}
                    onChange={(e) => updateDevice(d.id, "name", e.target.value)}
                    placeholder="e.g. Receptacle"
                    className="form-input min-w-[12rem] flex-1"
                  />
                </Field>
                <Field label="Qty">
                  <input
                    type="number"
                    min={0}
                    value={d.quantity}
                    onChange={(e) => updateDevice(d.id, "quantity", Number(e.target.value))}
                    className="form-input w-20"
                  />
                </Field>
                <Field label="$/unit">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={centsToDollars(d.unitCostCents)}
                    onChange={(e) => updateDeviceCost(d.id, Number(e.target.value))}
                    className="form-input w-24"
                  />
                </Field>
                <p className="pb-3 text-sm font-bold text-charcoal">
                  {formatCurrency(d.quantity * d.unitCostCents)}
                </p>
                <button
                  type="button"
                  onClick={() => removeDevice(d.id)}
                  className="mb-3 rounded-full border border-clay/40 px-3 py-2 text-xs font-black text-clay hover:bg-clay/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={addDevice} className={`mt-4 ${secondaryButtonClass}`}>
          Add device
        </button>
        <p className="mt-3 text-sm font-bold text-charcoal/65">
          Devices subtotal: <span className="text-deep-pine">{formatCurrency(totals.devicesCostCents)}</span>
        </p>
      </section>

      {/* Adders + Labor */}
      <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-1 font-display text-xl font-bold tracking-[-0.02em] text-moss">
              Adders
            </h3>
            <p className="mb-3 text-sm font-bold text-charcoal/65">
              A % markup on materials (wire + devices).
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Adder %">
                <input
                  type="number"
                  min={0}
                  value={data.adderPercent}
                  onChange={(e) => setAdderPercent(Number(e.target.value))}
                  className="form-input w-24"
                />
              </Field>
              <p className="pb-3 text-sm font-bold text-charcoal">
                {formatCurrency(totals.addersCostCents)} on {formatCurrency(totals.materialsCostCents)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-1 font-display text-xl font-bold tracking-[-0.02em] text-moss">
              Labor
            </h3>
            <p className="mb-3 text-sm font-bold text-charcoal/65">
              Estimated hours × an hourly charge.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Hours">
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={data.laborHours}
                  onChange={(e) => setLaborHours(Number(e.target.value))}
                  className="form-input w-24"
                />
              </Field>
              <Field label="$/hr">
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={centsToDollars(data.hourlyRateCents)}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="form-input w-24"
                />
              </Field>
              <p className="pb-3 text-sm font-bold text-charcoal">
                {formatCurrency(totals.laborCostCents)}
              </p>
            </div>
          </div>
        </div>

        {/* Total job cost */}
        <div className="mt-6 rounded-xl1 border border-pine/10 bg-cream p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-charcoal/70">
            <span>Materials</span>
            <span>{formatCurrency(totals.materialsCostCents)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-charcoal/70">
            <span>+ Adders</span>
            <span>{formatCurrency(totals.addersCostCents)}</span>
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