// TEMPORARY BUILD STATUS
// This component tracks internal build progress only.
// Once the app is production-ready, delete this file and remove its
// usage from app/page.tsx. No other code depends on it.

type StatusItem = {
  label: string;
  status: string;
};

const BUILD_ITEMS: StatusItem[] = [
  { label: "Quote builder & calculator", status: "Done" },
  { label: "Save to Supabase", status: "Done" },
  { label: "Dashboard quote history", status: "Done" },
  { label: "Saved quote view (/quotes/[id])", status: "Done" },
  { label: "Prevent duplicate saves", status: "Next" },
  { label: "PDF exports", status: "Later" },
  { label: "Owner login", status: "Launch prep" }
];

export function DashboardBuildStatus() {
  return (
    <section className="rounded-xl2 border border-pine/10 bg-whitewarm/60 p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-clay">
          V1 Build Status
        </p>
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-charcoal/40">
          Internal only
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BUILD_ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-soft border border-pine/10 bg-cream/80 px-3 py-2"
          >
            <span className="text-sm font-bold text-charcoal">
              {item.label}
            </span>
            <span className="rounded-full bg-sage/30 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-deep-pine">
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}