import { formatDate } from "@/lib/currency";
import { isPaidInFull } from "@/lib/invoice-calculations";
import type { InvoiceReceipts } from "@/lib/email-log";
import type {
  InvoiceData,
  InvoiceRecord,
  ProjectStatus,
  QuoteStatus
} from "@/lib/types";
export type { ProjectStatus };

// Client-safe data layer for the Project Status Tracker (/projects). Each
// accepted quote is shown as an 8-stage strip. Only the 4 manual field-stage
// dates are stored (quotes.project_status JSONB); the other 4 stages are
// DERIVED from existing quote/invoice/email-log facts so the tracker can never
// disagree with /quotes or /receivables. The scheduling tool is shown on a
// card as context only (crew names) and never drives stage completion.
//
// This module is imported by client components (project-advance-button imports
// todayDateOnly + types), so it MUST stay client-safe: no next/headers, no
// getSupabaseServer. The server-only crew fetcher lives in lib/projects-server.

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

// ---------------------------------------------------------------------------
// Service-call tracker
//
// Service calls get a SIMPLER 5-stage strip (Quote / Accepted / Scheduled /
// Billed / Paid) instead of the 8-stage new-build strip. Only "Scheduled" is a
// manual action (a status write to "scheduled"); the rest are derived from
// quote status + the single service invoice + its email-log receipt, so this
// view can never disagree with /quotes or /receivables. "Billed" = the service
// invoice was emailed (a sent email_log row) OR collected (marked paid), the
// same rule as the new-build billed stages.

export type ServiceStageId =
  | "quote"
  | "accepted"
  | "scheduled"
  | "billed"
  | "paid";

export type ServiceStageState = {
  id: ServiceStageId;
  label: string;
  done: boolean;
  date: string | null;
  manual: boolean;
};

export type ServiceProjectStages = {
  stages: ServiceStageState[];
  activeStageId: ServiceStageId | null;
  filterBucket: FilterBucket;
};

type ServiceComputeArgs = {
  createdAt: string;
  status: QuoteStatus;
  invoiceData: InvoiceData | null;
  receipts: InvoiceReceipts;
};

function findServiceInvoice(data: InvoiceData): InvoiceRecord | null {
  return data.invoices.find((inv) => inv.kind === "service") ?? null;
}

export function computeServiceCallStages(
  args: ServiceComputeArgs
): ServiceProjectStages {
  const { createdAt, status, invoiceData, receipts } = args;

  const serviceInvoice = invoiceData ? findServiceInvoice(invoiceData) : null;
  const emailedAt = receipts.service;
  const servicePaid = serviceInvoice?.status === "paid";

  // Billed = service invoice emailed OR paid. Date prefers the emailed
  // timestamp, falling back to the paid timestamp.
  const billedDone = Boolean(emailedAt) || servicePaid;
  const billedDate = emailedAt ?? (servicePaid ? serviceInvoice?.paidAt ?? null : null);

  const paidDone = isPaidInFull(invoiceData, receipts);
  const paidDate = serviceInvoice?.paidAt ?? null;

  // Accepted/Scheduled are status-derived. Paid is NOT a stored status (it is
  // derived from the invoice being paid in full below), so a paid service call
  // keeps status "scheduled" (or "accepted" if never marked scheduled) and the
  // billed/paid stages light up from the invoice + receipt facts.
  const acceptedDone = status === "accepted" || status === "scheduled";
  const scheduledDone = status === "scheduled";

  const stages: ServiceStageState[] = [
    {
      id: "quote",
      label: "Quote",
      done: true,
      date: createdAt,
      manual: false
    },
    {
      id: "accepted",
      label: "Accepted",
      done: acceptedDone,
      date: null,
      manual: false
    },
    {
      id: "scheduled",
      label: "Scheduled",
      done: scheduledDone,
      date: null,
      // The one manual action on a service call: writing status "scheduled".
      manual: true
    },
    {
      id: "billed",
      label: "Billed",
      done: billedDone,
      date: billedDate,
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
  } else if (activeStageId === "paid") {
    // Billed but not yet paid: invoice sent, waiting for payment.
    filterBucket = "awaiting_payment";
  } else {
    // quote / accepted / scheduled / billed (not yet billed) = work in progress.
    filterBucket = "in_field";
  }

  return { stages, activeStageId, filterBucket };
}