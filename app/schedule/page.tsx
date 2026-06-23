import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ScheduleBoard } from "@/components/schedule-board";
import { getCrew, getScheduleRange, getSchedulableJobs } from "@/lib/schedule";

// Always read the live crew + assignments + schedulable jobs from Supabase.
export const dynamic = "force-dynamic";

// Monday of the current week as YYYY-MM-DD. Computed on the server (UTC); the
// board's Today button re-centers to the owner's local week on tap, so a
// Sunday-evening open at most shows the next week until they tap Today.
function currentWeekStartISO(): string {
  const now = new Date();
  const offset = (now.getDay() + 6) % 7; // Monday-based
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function SchedulePage() {
  const weekStartISO = currentWeekStartISO();
  const weekEndISO = addDaysISO(weekStartISO, 6);

  const [allCrew, jobs, assignments] = await Promise.all([
    getCrew(),
    getSchedulableJobs(),
    getScheduleRange(weekStartISO, weekEndISO)
  ]);
  const activeCrew = allCrew.filter((c) => c.active);

  return (
    <AppShell>
      <div className="mb-8">
        <Link
          href="/"
          className="mb-6 inline-flex text-sm font-black text-deep-pine underline decoration-clay/40 decoration-2 underline-offset-4"
        >
          Back to dashboard
        </Link>

        <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
          Schedule
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Who&apos;s where this week.
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Schedule the crew on rough-in and finish jobs, plus service calls. Tap a
          day to add, tap a card to edit. Times are optional — leave them blank for
          an all-day job.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="mb-6 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-bold text-clay">
          No accepted quotes yet, so the Quote job picker will be empty. You can
          still schedule service calls. Mark a quote Accepted to schedule it as a
          job.
        </div>
      ) : null}

      <ScheduleBoard
        crew={activeCrew}
        jobs={jobs}
        initialAssignments={assignments}
        weekStartISO={weekStartISO}
      />
    </AppShell>
  );
}