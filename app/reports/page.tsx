import { AppShell } from "@/components/app-shell";
import { ReportsView } from "@/components/reports-view";
import { getReportDataset } from "@/lib/reports-server";

// Reporting reads live from Supabase so a payment or a newly emailed invoice
// shows on reload. Never cached.
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  try {
    const dataset = await getReportDataset();
    return (
      <AppShell>
        <ReportsView dataset={dataset} />
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell>
        <p className="rounded-xl2 border border-clay/30 bg-cream p-5 font-bold text-clay">
          Could not load report data.{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </AppShell>
    );
  }
}
