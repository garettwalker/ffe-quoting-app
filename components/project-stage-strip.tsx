import { formatStageDate, type StageState } from "@/lib/projects";

// The 8-stage progress strip for a project card. Pure presentational (a server
// component — no interactivity; advancing stages happens via the footer
// buttons in project-advance-button). Done stages are filled sage with a
// check; the active stage is outlined clay with a pulse; upcoming stages are
// muted stone. Horizontally scrolls on narrow viewports. The pulse is disabled
// under prefers-reduced-motion. Mirrors the approved mockup at
// public/mockups/mockup-projects.html (house palette, no em dashes in copy).

export function ProjectStageStrip({ stages }: { stages: StageState[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative flex min-w-[860px] items-start pt-1">
        {/* connector line behind the nodes */}
        <div className="pointer-events-none absolute left-6 right-6 top-[23px] h-[3px] rounded-full bg-stone" />

        {stages.map((stage, index) => {
          const isDone = stage.done;
          // active = the first not-done stage (every stage before it is done).
          const isActive = !isDone && stages.slice(0, index).every((s) => s.done);
          const upcoming = !isDone && !isActive;
          const dateLabel = formatStageDate(stage.date);

          return (
            <div
              key={stage.id}
              className="relative z-[1] flex min-w-[96px] flex-1 flex-col items-center text-center"
            >
              <div
                className={`grid h-[46px] w-[46px] place-items-center rounded-full border-[3px] text-[18px] font-black transition-transform ${
                  isDone
                    ? "border-sage bg-sage text-deep-pine"
                    : isActive
                      ? "border-clay bg-cream text-clay shadow-[0_0_0_5px_rgba(165,101,67,0.14)]"
                      : "border-stone bg-whitewarm text-stone"
                }`}
              >
                {isDone ? (
                  <span aria-hidden="true">&#10003;</span>
                ) : stage.id === "roughInBilled" || stage.id === "finalBilled" ? (
                  <span aria-hidden="true">$</span>
                ) : isActive ? (
                  <span aria-hidden="true">&#9650;</span>
                ) : (
                  <span aria-hidden="true">&#9675;</span>
                )}
                {isActive ? (
                  <span
                    className="pointer-events-none absolute inset-[-3px] animate-project-pulse rounded-full border-2 border-clay motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <p
                className={`mt-[11px] text-xs font-black leading-tight ${
                  isDone
                    ? "text-deep-pine"
                    : isActive
                      ? "text-clay"
                      : "text-charcoal/50"
                }`}
              >
                {stage.label}
              </p>
              <p
                className={`mt-[3px] text-[11px] font-bold tabular-nums text-charcoal/55 ${
                  upcoming ? "opacity-50" : ""
                }`}
              >
                {dateLabel || (upcoming ? "-" : "In progress")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}