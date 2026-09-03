"use client";

import type { ScheduleStatus } from "@/lib/schedule";

type Job = {
  id: string;
  title: string;
  location: string;
  status: string;
  workDate: string;
};

// Assignment statuses (ScheduleStatus), not quote lifecycle stages — a plain
// label map mirrors StatusBadge's styling without shoehorning one into the other.
const STATUS_STYLES: Record<ScheduleStatus, string> = {
  scheduled: "bg-clay/20 text-clay",
  completed: "bg-moss text-whitewarm",
  cancelled: "bg-stone/40 text-charcoal/60",
};

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function WeekSummary({ jobs }: { jobs: Job[] }) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="p-8 rounded-3xl bg-whitewarm border border-dashed border-pine/20 text-center">
        <p className="text-sm font-bold text-charcoal/50">No jobs scheduled for this week.</p>
      </div>
    );
  }

  return (
    <div className="bg-whitewarm border border-pine/10 rounded-3xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-pine/10 bg-pine/5 flex justify-between items-center">
        <h3 className="text-sm font-black uppercase tracking-widest text-deep-pine">This Week's Schedule</h3>
        <span className="text-xs font-bold text-charcoal/50">{jobs.length} Assignments</span>
      </div>
      <div className="divide-y divide-pine/5">
        {jobs.map((job) => (
          <div key={job.id} className="px-6 py-4 flex items-center justify-between hover:bg-pine/5 transition-colors">
            <div className="flex items-center gap-4">
              <div className="text-xs font-bold text-charcoal/40 w-20 shrink-0">
                {new Date(job.workDate).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div>
                <p className="text-sm font-bold text-deep-pine">
                  {job.title}
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                STATUS_STYLES[job.status as ScheduleStatus] ?? "bg-stone text-deep-pine"
              }`}
            >
              {STATUS_LABELS[job.status as ScheduleStatus] ?? job.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
