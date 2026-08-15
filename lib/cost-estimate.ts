// Internal project cost estimator + P&L calc engine.
//
// All money is integer cents (matching lib/currency.ts). This module is
// CLIENT-SAFE: it imports only types and has no Supabase dependency, so the
// client-side cost editor and P&L views can import it without pulling a
// server-only Supabase client into the browser bundle. Mirrors the
// lib/base-rates.ts pattern.
//
// The estimator is INTERNAL ONLY — it never appears on a customer-facing
// quote, PDF, invoice, or email.
//
// Cost model (revised 2026-08-15 to match how Chad actually tracks a job):
//   job cost = materials + labor
//   materials = a few named $ buckets (Wire / Receptacles & boxes / Panels &
//                feed wire, by default) — the owner types the dollar amount
//                per bucket per job. No footage calc, no per-gauge rolls.
//   labor     = one line per person, hours split across rough-in and finish,
//                line cost = rate x (roughInHours + finishHours).
// There is deliberately NO "adders %" markup on the cost side. Margin is
// already built into the quote's adder line-item prices (the revenue side),
// so adding a markup to cost would understate true margin. True margin =
// revenue (quote/invoice) - this cost.

// One editable materials bucket: a name and a dollar amount. Seeded from the
// default buckets (Wire / Receptacles & boxes / Panels & feed wire) at $0;
// the owner fills the amount per job and can rename / add / remove buckets.
export type MaterialBucket = {
  id: string;
  name: string;
  costCents: number;
};

// One editable labor line: a person, their hourly rate, and the hours they
// worked split by phase. Rough-in and finish are tracked separately because
// there is a time gap between them (sheetrock goes up in between), so the
// owner wants to see each phase's labor cost independently. A line's total
// labor cost is rateCents * (roughInHours + finishHours). Example from Chad
// on the Darren Burke project: chad 70h @ $70, michael 16h @ $30, adam 22h
// @ $21, jb 22h @ $15.
export type LaborLine = {
  id: string;
  person: string;
  rateCents: number;
  roughInHours: number;
  finishHours: number;
};

// The full per-job cost estimate, stored as JSONB in quotes.cost_estimate_data.
// Nullable on the column; old quotes have no estimate and the P&L view builds
// a default (the default material buckets + a blank labor line) on first open.
export type CostEstimateData = {
  // Named $ material buckets. Seeded from the global defaults; the owner
  // types the amount per bucket and can add/rename/remove.
  materials: MaterialBucket[];
  // Labor, entered one line per person. See LaborLine.
  laborLines: LaborLine[];
  updatedAt?: string;
};

// The global defaults the owner edits in Pricing Admin, stored as JSONB in
// app_settings.cost_estimate_defaults. The default material bucket NAMES seed
// each new job's materials section (each starts at $0); the default labor
// rate seeds each newly added labor line.
export type CostEstimateDefaults = {
  defaultMaterialBuckets: { name: string }[];
  // Seeds the rate on a newly added labor line. The owner overrides per line.
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

// Chad's default material buckets and a placeholder labor rate. Used when
// app_settings.cost_estimate_defaults is empty/null AND as the seed for a
// first-time Pricing Admin view. The owner edits these in Pricing Admin and
// the per-job amounts on the Job P&L page.
export const DEFAULT_COST_ESTIMATE_DEFAULTS: CostEstimateDefaults = {
  defaultMaterialBuckets: [
    { name: "Wire" },
    { name: "Receptacles & boxes" },
    { name: "Panels & feed wire" }
  ],
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
// piece. Tolerates an empty/null column (first run before the owner edits) and
// silently ignores the legacy wireDefaults / defaultAdderPercent fields from
// the first cost-estimate release (no longer used).
export function normalizeDefaults(
  raw: unknown
): CostEstimateDefaults {
  if (!raw || typeof raw !== "object") return cloneDefaults();

  const obj = raw as Partial<CostEstimateDefaults>;
  const builtIn = DEFAULT_COST_ESTIMATE_DEFAULTS;

  const defaultMaterialBuckets =
    Array.isArray(obj.defaultMaterialBuckets) && obj.defaultMaterialBuckets.length > 0
      ? obj.defaultMaterialBuckets.map((b) => ({
          name: typeof b?.name === "string" && b.name.trim() ? b.name : "Material"
        }))
      : builtIn.defaultMaterialBuckets.map((b) => ({ ...b }));

  return {
    defaultMaterialBuckets,
    defaultHourlyRateCents: num(
      obj.defaultHourlyRateCents,
      builtIn.defaultHourlyRateCents
    )
  };
}

function cloneDefaults(): CostEstimateDefaults {
  return {
    defaultMaterialBuckets: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultMaterialBuckets.map(
      (b) => ({ ...b })
    ),
    defaultHourlyRateCents: DEFAULT_COST_ESTIMATE_DEFAULTS.defaultHourlyRateCents
  };
}

// Build a fresh per-job estimate from the global defaults: the default
// material buckets (each at $0) + one blank labor line at the default rate.
// The sqft param is kept for signature stability but is no longer used —
// materials are entered as direct $ amounts per Chad's workflow, not derived
// from square footage. This is what the P&L view shows when the quote has no
// saved estimate yet.
export function buildDefaultCostEstimate(
  _sqft: number,
  defaults: CostEstimateDefaults
): CostEstimateData {
  void _sqft;
  return {
    materials: defaults.defaultMaterialBuckets.map((b) => ({
      id: makeMaterialId(),
      name: b.name,
      costCents: 0
    })),
    // Seed one blank labor line at the default rate so the owner sees the
    // shape (person / rate / rough-in hrs / finish hrs) and can start typing.
    laborLines: [
      {
        id: makeLaborId(),
        person: "",
        rateCents: defaults.defaultHourlyRateCents,
        roughInHours: 0,
        finishHours: 0
      }
    ]
  };
}

// Normalize a CostEstimateData loaded from JSONB into a safe, complete object
// (a partial/old shape never crashes the calc or the editor). Used when
// reading a saved estimate. Migrates the two prior shapes:
//   - First release: wire[] (5 gauges, feet/roll/$) + devices[] + adderPercent
//     + laborHours/hourlyRateCents. Wire cost is rolled into one "Wire" bucket,
//     each device becomes its own bucket, adderPercent is dropped (it was
//     margin, not cost), and the single-rate labor becomes one labor line.
//   - Second release: materials[] + laborLines[] (current shape) — used as-is.
export function normalizeCostEstimate(
  raw: unknown,
  defaults: CostEstimateDefaults
): CostEstimateData {
  const base = buildDefaultCostEstimate(0, defaults);
  if (!raw || typeof raw !== "object") return base;

  const obj = raw as Partial<CostEstimateData>;
  const legacy = obj as unknown as Record<string, unknown>;

  // --- materials ---
  let materials: MaterialBucket[];
  if (Array.isArray(obj.materials)) {
    materials = obj.materials
      .filter((m) => m && typeof m === "object")
      .map((m) => ({
        id: typeof m.id === "string" && m.id ? m.id : makeMaterialId(),
        name: typeof m.name === "string" ? m.name : "Material",
        costCents: Math.max(0, num(m.costCents))
      }));
    if (materials.length === 0) materials = base.materials;
  } else if (Array.isArray(legacy.wire) || Array.isArray(legacy.devices)) {
    // Migrate the first-release shape: roll wire into one bucket, each device
    // into its own bucket. adderPercent is intentionally not applied (margin).
    const buckets: MaterialBucket[] = [];
    const savedWire = (legacy.wire as Record<string, unknown>[]) ?? [];
    const wireCost = savedWire.reduce<number>((sum, row) => {
      const feet = Math.max(0, num(row?.feet));
      const rollLength = Math.max(1, num(row?.rollLengthFt));
      const costPerRoll = Math.max(0, num(row?.costPerRollCents));
      return sum + Math.ceil(feet / rollLength) * costPerRoll;
    }, 0);
    if (wireCost > 0 || savedWire.length > 0) {
      buckets.push({ id: makeMaterialId(), name: "Wire", costCents: wireCost });
    }
    const savedDevices = (legacy.devices as unknown[]) ?? [];
    for (const d of savedDevices) {
      const row = d as Record<string, unknown>;
      const qty = Math.max(0, num(row?.quantity));
      const unitCost = Math.max(0, num(row?.unitCostCents));
      const name = typeof row?.name === "string" && row.name ? row.name : "Device";
      buckets.push({
        id: typeof row?.id === "string" && row.id ? (row.id as string) : makeMaterialId(),
        name,
        costCents: qty * unitCost
      });
    }
    materials = buckets.length > 0 ? buckets : base.materials;
  } else {
    materials = base.materials;
  }

  // --- labor (prefer laborLines; migrate old single-rate shape) ---
  let laborLines: LaborLine[];
  if (Array.isArray(obj.laborLines)) {
    laborLines = obj.laborLines
      .filter((l) => l && typeof l === "object")
      .map((l) => ({
        id: typeof l.id === "string" && l.id ? l.id : makeLaborId(),
        person: typeof l.person === "string" ? l.person : "",
        rateCents: num(l.rateCents, defaults.defaultHourlyRateCents),
        roughInHours: num(l.roughInHours),
        finishHours: num(l.finishHours)
      }));
    if (laborLines.length === 0) laborLines = base.laborLines;
  } else if (legacy.laborHours != null || legacy.hourlyRateCents != null) {
    laborLines = [
      {
        id: makeLaborId(),
        person: "",
        rateCents: num(legacy.hourlyRateCents, defaults.defaultHourlyRateCents),
        roughInHours: num(legacy.laborHours),
        finishHours: 0
      }
    ];
  } else {
    laborLines = base.laborLines;
  }

  return {
    materials,
    laborLines,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined
  };
}

export type CostEstimateTotals = {
  materialsCostCents: number;
  // Labor split by phase so the editor and report can show rough-in vs finish
  // independently. laborCostCents is the sum of the two.
  roughInLaborCents: number;
  finishLaborCents: number;
  laborCostCents: number;
  totalJobCostCents: number;
};

// Compute the cost totals from a cost estimate. Pure function, no side effects.
// Guards against NaN and negative inputs (costs are floored at 0). Job cost is
// materials + labor (no margin markup — margin lives on the revenue side).
export function computeCostEstimate(data: CostEstimateData): CostEstimateTotals {
  const buckets = Array.isArray(data.materials) ? data.materials : [];
  const materialsCostCents = buckets.reduce((sum, b) => {
    return sum + Math.max(0, num(b.costCents));
  }, 0);

  // Labor: each line costs rateCents * hours, split by phase.
  const lines = Array.isArray(data.laborLines) ? data.laborLines : [];
  const roughInLaborCents = lines.reduce((sum, l) => {
    const rate = Math.max(0, num(l.rateCents));
    const hours = Math.max(0, num(l.roughInHours));
    return sum + Math.round(rate * hours);
  }, 0);
  const finishLaborCents = lines.reduce((sum, l) => {
    const rate = Math.max(0, num(l.rateCents));
    const hours = Math.max(0, num(l.finishHours));
    return sum + Math.round(rate * hours);
  }, 0);
  const laborCostCents = roughInLaborCents + finishLaborCents;

  const totalJobCostCents = materialsCostCents + laborCostCents;

  return {
    materialsCostCents,
    roughInLaborCents,
    finishLaborCents,
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

// Short slug ids for new rows (React keys). Kept local so this module stays
// client-safe without importing a slugify helper.
export function makeMaterialId(): string {
  return `mat-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeLaborId(): string {
  return `lab-${Math.random().toString(36).slice(2, 10)}`;
}