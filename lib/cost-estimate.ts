// Internal project cost estimator + P&L calc engine.
//
// All money is integer cents (matching lib/currency.ts). This module is
// CLIENT-SAFE: it imports only types and has no Supabase dependency, so the
// client-side cost editor and P&L views can import it without pulling a
// server-only Supabase client into the browser bundle. Mirrors the
// lib/base-rates.ts pattern.
//
// The estimator is INTERNAL ONLY — it never appears on a customer-facing
// quote, PDF, invoice, or email. See the plan in the conversation history
// (2026-08-15).

// The five wire gauges tracked by the estimator, in display order. Each is
// one editable row. Names match electrical NM cable sizes.
export const COST_ESTIMATE_GAUGES = ["14/2", "12/2", "14/3", "10/2", "10/3"] as const;
export type CostEstimateGauge = (typeof COST_ESTIMATE_GAUGES)[number];

// One editable wire row: how many feet the job needs, the roll/bail length
// that converts feet to rolls, and the cost per roll. Rolls needed is
// ceil(feet / rollLengthFt) — you buy whole rolls, not partial feet.
export type CostEstimateWireRow = {
  gauge: string;
  feet: number;
  rollLengthFt: number;
  costPerRollCents: number;
};

// One editable devices/outlets line (receptacles, switches, etc.).
export type CostEstimateDeviceRow = {
  id: string;
  name: string;
  quantity: number;
  unitCostCents: number;
};

// The full per-job cost estimate, stored as JSONB in quotes.cost_estimate_data.
// Nullable on the column; old quotes have no estimate and the P&L view builds
// a default from the quote's sqft on first open.
export type CostEstimateData = {
  // Always the five gauges above, in order.
  wire: CostEstimateWireRow[];
  // Seeded empty; the owner adds lines per job.
  devices: CostEstimateDeviceRow[];
  // A % markup applied to materials (wire + devices). The "adders" box.
  adderPercent: number;
  // Labor: estimated hours x an hourly charge.
  laborHours: number;
  hourlyRateCents: number;
  updatedAt?: string;
};

// The global defaults the owner edits in Pricing Admin, stored as JSONB in
// app_settings.cost_estimate_defaults. `feetPerSqft` is the heuristic ratio:
// default wire feet = round(sqft * feetPerSqft) per gauge.
export type CostEstimateDefaults = {
  wireDefaults: {
    gauge: string;
    rollLengthFt: number;
    costPerRollCents: number;
    feetPerSqft: number;
  }[];
  defaultAdderPercent: number;
  defaultHourlyRateCents: number;
};

// The revenue basis for a P&L view. Selected via the basis toggle.
export type CostBasis = "contracted" | "invoiced" | "paid";

// Derived per-job P&L. Not stored — computed from existing quote/invoice data
// plus the cost estimate. See lib/pnl.ts.
export type JobPnl = {
  quoteId: string;
  jobId: string;
  jobName: string;
  clientName: string;
  // Earliest invoice issued date, else the quote date — the period key for the
  // aggregated quarter/year report.
  periodDate: string | null;
  contractedCents: number;
  invoicedCents: number;
  paidCents: number;
  costCents: number;
  // True when a cost estimate has been saved on the quote (cost was actually
  // entered, not just the auto-built default). The UI flags jobs with no saved
  // cost so they don't read as 100% margin.
  hasCost: boolean;
};

// Chad's numbers, the built-in fallback. Used when app_settings.cost_estimate_defaults
// is empty/null AND as the seed for a first-time Pricing Admin view. Rule of thumb
// from Chad: roughly 1,000' of 14/2 per 1,000 sqft; a 3,000 sqft house takes
// ~3,000-4,000' 14/2, ~1,000' 12/2, ~500' 14/3, then more 10/2 / 10/3 for big
// loads (HVAC, water heaters). Costs are per roll/bail: 14/2=$275, 12/2=$375,
// 14/3=$300 (1000' bails); 10/2=$210, 10/3=$250 (250' rolls). The owner edits
// these in Pricing Admin and overrides any of them per job.
export const DEFAULT_COST_ESTIMATE_DEFAULTS: CostEstimateDefaults = {
  wireDefaults: [
    { gauge: "14/2", rollLengthFt: 1000, costPerRollCents: 27500, feetPerSqft: 1.0 },
    { gauge: "12/2", rollLengthFt: 1000, costPerRollCents: 37500, feetPerSqft: 0.33 },
    { gauge: "14/3", rollLengthFt: 1000, costPerRollCents: 30000, feetPerSqft: 0.17 },
    { gauge: "10/2", rollLengthFt: 250, costPerRollCents: 21000, feetPerSqft: 0 },
    { gauge: "10/3", rollLengthFt: 250, costPerRollCents: 25000, feetPerSqft: 0 }
  ],
  defaultAdderPercent: 10,
  defaultHourlyRateCents: 7500
};

// Coerce an unknown/JSON-loaded value into a safe number, defaulting to 0 for
// null/NaN. PostgREST returns JSONB numbers as JS numbers, but a missing or
// malformed field should never crash the calc.
function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Normalize a defaults object loaded from JSONB into a complete
// CostEstimateDefaults, falling back to built-in defaults for any missing
// piece. Tolerates an empty/null column (first run before the owner edits).
export function normalizeDefaults(
  raw: unknown
): CostEstimateDefaults {
  if (!raw || typeof raw !== "object") return cloneDefaults();

  const obj = raw as Partial<CostEstimateDefaults>;
  const builtIn = DEFAULT_COST_ESTIMATE_DEFAULTS;

  const wireDefaults = Array.isArray(obj.wireDefaults) && obj.wireDefaults.length > 0
    ? obj.wireDefaults.map((w, i) => {
        const fallback = builtIn.wireDefaults[i] ?? builtIn.wireDefaults[0];
        return {
          gauge: typeof w?.gauge === "string" ? w.gauge : fallback.gauge,
          rollLengthFt: num(w?.rollLengthFt, fallback.rollLengthFt),
          costPerRollCents: num(w?.costPerRollCents, fallback.costPerRollCents),
          feetPerSqft: num(w?.feetPerSqft, fallback.feetPerSqft)
        };
      })
    : builtIn.wireDefaults.map((w) => ({ ...w }));

  return {
    wireDefaults,
    defaultAdderPercent: num(obj.defaultAdderPercent, builtIn.defaultAdderPercent),
    defaultHourlyRateCents: num(obj.defaultHourlyRateCents, builtIn.defaultHourlyRateCents)
  };
}

function cloneDefaults(): CostEstimateDefaults {
  return {
    wireDefaults: DEFAULT_COST_ESTIMATE_DEFAULTS.wireDefaults.map((w) => ({ ...w })),
    defaultAdderPercent: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultAdderPercent,
    defaultHourlyRateCents: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultHourlyRateCents
  };
}

// Build a fresh per-job estimate from the quote's sqft + the global defaults.
// Wire feet are seeded from the heuristic (round(sqft * feetPerSqft)); the
// adder % and hourly rate come from the defaults; devices start empty. The
// owner then edits every number. This is what the P&L view shows when the
// quote has no saved estimate yet.
export function buildDefaultCostEstimate(
  sqft: number,
  defaults: CostEstimateDefaults
): CostEstimateData {
  const safeSqft = Math.max(0, num(sqft));
  return {
    wire: defaults.wireDefaults.map((w) => ({
      gauge: w.gauge,
      feet: Math.round(safeSqft * w.feetPerSqft),
      rollLengthFt: w.rollLengthFt,
      costPerRollCents: w.costPerRollCents
    })),
    devices: [],
    adderPercent: defaults.defaultAdderPercent,
    laborHours: 0,
    hourlyRateCents: defaults.defaultHourlyRateCents
  };
}

// Normalize a CostEstimateData loaded from JSONB into a safe, complete object
// with all five wire gauges present (a partial/old shape never crashes the
// calc or the editor). Used when reading a saved estimate.
export function normalizeCostEstimate(
  raw: unknown,
  defaults: CostEstimateDefaults
): CostEstimateData {
  const base = buildDefaultCostEstimate(0, defaults);
  if (!raw || typeof raw !== "object") return base;

  const obj = raw as Partial<CostEstimateData>;

  // Wire: map saved rows onto the five canonical gauges by index/gauge match,
  // falling back to the default row when a gauge is missing.
  const savedWire = Array.isArray(obj.wire) ? obj.wire : [];
  const wire = base.wire.map((defaultRow, i) => {
    const saved =
      savedWire.find((w) => w?.gauge === defaultRow.gauge) ?? savedWire[i];
    if (!saved) return defaultRow;
    return {
      gauge: defaultRow.gauge,
      feet: num(saved.feet, defaultRow.feet),
      rollLengthFt: num(saved.rollLengthFt, defaultRow.rollLengthFt),
      costPerRollCents: num(saved.costPerRollCents, defaultRow.costPerRollCents)
    };
  });

  const devices = Array.isArray(obj.devices)
    ? obj.devices
        .filter((d) => d && typeof d === "object")
        .map((d) => ({
          id: typeof d.id === "string" && d.id ? d.id : `dev-${Math.random().toString(36).slice(2, 9)}`,
          name: typeof d.name === "string" ? d.name : "",
          quantity: num(d.quantity),
          unitCostCents: num(d.unitCostCents)
        }))
    : [];

  return {
    wire,
    devices,
    adderPercent: num(obj.adderPercent, base.adderPercent),
    laborHours: num(obj.laborHours, base.laborHours),
    hourlyRateCents: num(obj.hourlyRateCents, base.hourlyRateCents),
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined
  };
}

export type CostEstimateTotals = {
  wireCostCents: number;
  devicesCostCents: number;
  materialsCostCents: number;
  addersCostCents: number;
  laborCostCents: number;
  totalJobCostCents: number;
};

// Compute the cost totals from a cost estimate. Pure function, no side effects.
// Guards against NaN and negative inputs (costs are floored at 0).
export function computeCostEstimate(data: CostEstimateData): CostEstimateTotals {
  const wireCostCents = data.wire.reduce((sum, row) => {
    const feet = Math.max(0, num(row.feet));
    const rollLength = Math.max(1, num(row.rollLengthFt)); // avoid div-by-zero
    const costPerRoll = Math.max(0, num(row.costPerRollCents));
    const rolls = Math.ceil(feet / rollLength);
    return sum + rolls * costPerRoll;
  }, 0);

  const devicesCostCents = data.devices.reduce((sum, row) => {
    const qty = Math.max(0, num(row.quantity));
    const unitCost = Math.max(0, num(row.unitCostCents));
    return sum + qty * unitCost;
  }, 0);

  const materialsCostCents = wireCostCents + devicesCostCents;

  const adderPercent = Math.max(0, num(data.adderPercent));
  const addersCostCents = Math.round((materialsCostCents * adderPercent) / 100);

  const laborHours = Math.max(0, num(data.laborHours));
  const hourlyRate = Math.max(0, num(data.hourlyRateCents));
  const laborCostCents = Math.round(laborHours * hourlyRate);

  const totalJobCostCents =
    materialsCostCents + addersCostCents + laborCostCents;

  return {
    wireCostCents,
    devicesCostCents,
    materialsCostCents,
    addersCostCents,
    laborCostCents,
    totalJobCostCents
  };
}

// The revenue for a job under a chosen basis. Pure helper shared by the
// per-job view and the aggregate report.
export function revenueForJob(job: JobPnl, basis: CostBasis): number {
  switch (basis) {
    case "contracted":
      return job.contractedCents;
    case "invoiced":
      return job.invoicedCents;
    case "paid":
      return job.paidCents;
  }
}

export type MarginResult = {
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
};

// Margin under a chosen basis: revenue(basis) - cost, plus the percentage.
// marginPct is 0 (not NaN) when revenue is 0. Cost is always shown even when the
// job has no saved estimate — the caller decides whether to flag it.
export function marginFor(job: JobPnl, basis: CostBasis): MarginResult {
  const revenueCents = revenueForJob(job, basis);
  const costCents = job.costCents;
  const marginCents = revenueCents - costCents;
  const marginPct =
    revenueCents > 0 ? Math.round((marginCents / revenueCents) * 100) : 0;
  return { revenueCents, costCents, marginCents, marginPct };
}

// A short slug for a new device row id (React key). Mirrors the makeId pattern
// used by the pricing-admin editors, but kept local so this module stays
// client-safe without importing a slugify helper.
export function makeDeviceId(): string {
  return `dev-${Math.random().toString(36).slice(2, 10)}`;
}