import Link from "next/link";

export function DashboardEmptyState() {
  return (
    <section className="overflow-hidden rounded-xl2 border border-pine/10 bg-whitewarm/75 shadow-soft">
      <div className="grid gap-8 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-10">
        <div>
          <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Quoting Workspace
          </p>

          <h1 className="mb-5 max-w-3xl font-display text-5xl font-bold leading-[1.02] tracking-[-0.04em] text-moss md:text-6xl">
            Build clean, consistent electrical quotes.
          </h1>

          <p className="max-w-2xl text-lg leading-8 text-charcoal/75">
            Start a new quote, calculate the project total, review the line item
            detail, and prepare customer-facing quote documents from one place.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/quotes/new"
              className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-pine px-6 py-3 font-black text-whitewarm shadow-card transition hover:-translate-y-0.5 hover:bg-deep-pine"
            >
              Start New Quote
            </Link>

            <button
              type="button"
              className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-full border border-pine/20 bg-whitewarm/70 px-6 py-3 font-black text-deep-pine/45"
              title="Coming later"
            >
              Import Quote
            </button>
          </div>
        </div>

        <aside className="rounded-xl1 border border-pine/10 bg-cream p-6">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-clay">
            V1 Build Status
          </p>

          <div className="space-y-4">
            <StatusItem label="Dashboard" status="In progress" />
            <StatusItem label="Quote calculator" status="Next" />
            <StatusItem label="Save quote history" status="Later" />
            <StatusItem label="PDF exports" status="Later" />
            <StatusItem label="Owner login" status="Launch prep" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function StatusItem({
  label,
  status
}: {
  label: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-soft border border-pine/10 bg-whitewarm/70 px-4 py-3">
      <span className="font-bold text-charcoal">{label}</span>
      <span className="rounded-full bg-sage/30 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-deep-pine">
        {status}
      </span>
    </div>
  );
}
