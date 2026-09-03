"use client";

import { formatCurrency } from "@/lib/currency";
import { StatusBadge } from "@/components/status-badge";

type Job = {
  id: string;
  client_name: string;
  project_name: string | null;
  status: string;
  created_at: string;
  assignment_date: string;
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
                {new Date(job.assignment_date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div>
                <p className="text-sm font-bold text-deep-pine">
                  {job.client_name}
                  {job.project_name && <span className="text-charcoal/40 ml-1">({job.project_name})</span>}
                </p>
              </div>
            </div>
            <StatusBadge stage={job.status as any} />
          </div>
        ))}
      </div>
    </div>
  );
}
