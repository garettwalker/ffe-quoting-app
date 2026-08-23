import { getSupabaseServer } from "@/lib/supabase-server";
import { formatDate } from "@/lib/currency";
import { isPaidInFull } from "@/lib/invoice-calculations";
import type { InvoiceReceipts } from "@/lib/email-log";
import type { InvoiceData, InvoiceRecord, ProjectStatus } from "@/lib/types";
export type { ProjectStatus };

// Server-only data layer for the Project Status Tracker (/projects). Each
// accepted quote is shown as an 8-stage strip. Only the 4 manual field-stage
// dates are stored (quotes.project_status JSONB); the other 4 stages are
// DERIVED from existing quote/invoice/email-log facts so the tracker can never
// disagree with /quotes or /receivables. The scheduling tool is shown on a
// card as context only (crew names) and never drives stage completion.

// Coerce raw JSONB `project_status` into the typed shape. Tolerates null,
// non-object, or missing fields (every existing job has null until the owner
// advances a stage). Returns all-null when there is nothing to load.
export function normalizeProjectStatus(raw: unknown): ProjectStatus {
  const empty: ProjectStatus = {
    roughIn: null,
    roughInInspection: null,
    finish: null,
    finalInspection: null
  };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  const asDate = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    roughIn: asDate(obj.roughIn),
    roughInInspection: asDate(obj.roughInInspection),
    finish: asDate(obj.finish),
    finalInspection: asDate(obj.finalInspection)
  };
}

// The 8 tracker stages, in strip order. `manual` = the owner sets it
// (project_status); !manual = derived from invoicing / payment facts.
export type StageId =
  | "quote"
  | "roughIn"
  | "roughInInspection"
  | "roughInBilled"
  | "finish"
  | "finalInspection"
  | "finalBilled"
  | "paid";

export type StageState = {
  id: StageId;
  label: string;
  done: boolean;
  date: string | null; // ISO date (YYYY-MM-DD) or timestamp when done
  manual: boolean;
};

export type FilterBucket = "in_field" | "awaiting_payment" | "completed";

export type ProjectStages = {
  stages: StageState[]; // 8 in order
  activeStageId: StageId | null; // first not-done, or null when all done
  filterBucket: FilterBucket;
};

type ComputeArgs = {
  createdAt: string;
  projectStatus: ProjectStatus | null;
  invoiceData: InvoiceData | null;
  receipts: InvoiceReceipts;
};

function findInvoice(
  data: InvoiceData,
  kind: "initial" | "finish"
): InvoiceRecord | null {
  return data.invoices.find((inv) => inv.kind === kind) ?? null;
}

// "Billed" on the tracker = the invoice was actually emailed (a sent email_log
// row) OR collected (marked paid) — NOT the AR "receivable from setup" rule.
// This matches the mockup: the rough-in invoice is SENT after rough-in
// inspection. Returns { done, date } where date is the emailed date (preferred)
// or the paid date.
function billedStage(
  invoiceData: InvoiceData | null,
  receipts: InvoiceReceipts,
  kind: "initial" | "finish"
): { done: boolean; date: string | null } {
  if (!invoiceData) return { done: false, date: null };
  const invoice = findInvoice(invoiceData, kind);
  if (!invoice) return { done: false, date: null };
  const emailedAt = receipts[kind];
  if (invoice.status === "paid") {
    return { done: true, date: emailedAt ?? invoice.paidAt };
  }
  if (emailedAt) {
    return { done: true, date: emailedAt };
  }
  return { done: false, date: null };
}

// Derive all 8 stages. `receipts` is always a real object (empty when never
// emailed) so the receivable-aware branch runs.
export function computeProjectStages(args: ComputeArgs): ProjectStages {
  const { createdAt, projectStatus, invoiceData, receipts } = args;
  const ps = projectStatus ?? normalizeProjectStatus(null);

  const roughInBilled = billedStage(invoiceData, receipts, "initial");
  const finalBilled = billedStage(invoiceData, receipts, "finish");

  // Paid = the shared definition used by /quotes and /receivables. Date = the
  // latest paidAt across paid invoices (the moment the job was settled).
  const paidDone = isPaidInFull(invoiceData, receipts);
  const paidDate = invoiceData
    ? invoiceData.invoices
        .filter((inv) => inv.status === "paid" && inv.paidAt)
        .map((inv) => inv.paidAt as string)
        .sort()
        .at(-1) ?? null
    : null;

  const stages: StageState[] = [
    {
      id: "quote",
      label: "Quote",
      done: true,
      date: createdAt,
      manual: false
    },
    {
      id: "roughIn",
      label: "Rough-in",
      done: ps.roughIn != null,
      date: ps.roughIn,
      manual: true
    },
    {
      id: "roughInInspection",
      label: "Rough-in Insp.",
      done: ps.roughInInspection != null,
      date: ps.roughInInspection,
      manual: true
    },
    {
      id: "roughInBilled",
      label: "Rough-in Billed",
      done: roughInBilled.done,
      date: roughInBilled.date,
      manual: false
    },
    {
      id: "finish",
      label: "Finish",
      done: ps.finish != null,
      date: ps.finish,
      manual: true
    },
    {
      id: "finalInspection",
      label: "Final Insp.",
      done: ps.finalInspection != null,
      date: ps.finalInspection,
      manual: true
    },
    {
      id: "finalBilled",
      label: "Final Billed",
      done: finalBilled.done,
      date: finalBilled.date,
      manual: false
    },
    {
      id: "paid",
      label: "Paid",
      done: paidDone,
      date: paidDate,
      manual: false
    }
  ];

  const activeStageId = stages.find((s) => !s.done)?.id ?? null;

  let filterBucket: FilterBucket;
  if (activeStageId === null) {
    filterBucket = "completed";
  } else if (
    activeStageId === "roughIn" ||
    activeStageId === "roughInInspection" ||
    activeStageId === "finish" ||
    activeStageId === "finalInspection"
  ) {
    filterBucket = "in_field";
  } else {
    // roughInBilled / finalBilled / paid — field work done, money phase.
    filterBucket = "awaiting_payment";
  }

  return { stages, activeStageId, filterBucket };
}

// Format a stage date for display. Manual dates are date-only ("YYYY-MM-DD"),
// which `new Date()` parses as UTC midnight and would shift back a day in a
// negative timezone (e.g. Eastern). Append T00:00:00 so it parses as local.
// Derived dates are full ISO timestamps and format unchanged.
export function formatStageDate(value: string | null): string {
  if (!value) return "";
  const iso =
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  return formatDate(iso);
}

// Today as YYYY-MM-DD (local), stamped when the owner marks a field stage done.
// Uses local components (not UTC) so "today" matches the owner's clock.
export function todayDateOnly(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Distinct crew names on a quote's non-cancelled rough-in / finish schedule
// assignments, for the "Crew: James, Devon" context line on a project card.
// Returns a Map keyed by quote id (empty array = unassigned / unscheduled).
// Self-contained: three targeted queries (assignments, crew links, crew names).
export async function fetchScheduleForQuotes(
  quoteIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (quoteIds.length === 0) return out;
  const supabase = getSupabaseServer();
  const { data: assignments, error } = await supabase
    .from("schedule_assignments")
    .select("id, quote_id, phase, status")
    .in("quote_id", quoteIds)
    .neq("status", "cancelled");
  if (error || !assignments) return out;
  const rows = assignments as Array<{
    id: string;
    quote_id: string | null;
    phase: string | null;
    status: string;
  }>;
  if (rows.length === 0) return out;

  const { data: links } = await supabase
    .from("schedule_assignment_crew")
    .select("assignment_id, crew_id")
    .in("assignment_id", rows.map((r) => r.id));
  const crewByAssignment = new Map<string, string[]>();
  if (links) {
    for (const link of links as Array<{
      assignment_id: string;
      crew_id: string;
    }>) {
      const list = crewByAssignment.get(link.assignment_id) ?? [];
      list.push(link.crew_id);
      crewByAssignment.set(link.assignment_id, list);
    }
  }

  const crewIds = new Set<string>();
  for (const r of rows) {
    for (const cid of crewByAssignment.get(r.id) ?? []) crewIds.add(cid);
  }
  const nameById = new Map<string, string>();
  if (crewIds.size > 0) {
    const { data: crewRows } = await supabase
      .from("crew")
      .select("id, name")
      .in("id", Array.from(crewIds));
    if (crewRows) {
      for (const c of crewRows as Array<{ id: string; name: string }>) {
        nameById.set(c.id, c.name);
      }
    }
  }

  for (const r of rows) {
    if (!r.quote_id) continue;
    const names = (crewByAssignment.get(r.id) ?? [])
      .map((cid) => nameById.get(cid))
      .filter((n): n is string => Boolean(n));
    const list = out.get(r.quote_id) ?? [];
    for (const n of names) {
      if (!list.includes(n)) list.push(n);
    }
    out.set(r.quote_id, list);
  }
  return out;
}