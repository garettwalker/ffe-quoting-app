import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ContingencyEditor } from "@/components/contingency-editor";
import { CrewEditor } from "@/components/crew-editor";
import { PricingItemEditor } from "@/components/pricing-item-editor";
import { PricingLevelEditor } from "@/components/pricing-level-editor";
import { ProjectTypeEditor } from "@/components/project-type-editor";
import { SettingsEditor } from "@/components/settings-editor";
import { getPricingCatalog } from "@/lib/pricing";
import { getCrew } from "@/lib/schedule";

// Always read the live catalog from Supabase (no caching), so edits made here
// are reflected immediately on reload and after each editor's router.refresh().
export const dynamic = "force-dynamic";

export default async function PricingAdminPage() {
  const [catalog, crew] = await Promise.all([getPricingCatalog(), getCrew()]);

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
          Pricing Admin
        </p>

        <h1 className="font-display text-5xl font-bold tracking-[-0.04em] text-moss md:text-6xl">
          Manage pricing and business info.
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-charcoal/75">
          Edit the line items, pricing levels, contingencies, and project types
          used when building quotes, plus the business info shown on printable
          quotes and invoices. Deactivate instead of deleting so old quotes stay
          accurate.
        </p>
      </div>

      {catalog.items.length === 0 &&
      catalog.levels.length === 0 &&
      catalog.contingencies.length === 0 &&
      catalog.projectTypes.length === 0 ? (
        <div className="mb-8 rounded-soft border border-clay/30 bg-clay/10 px-4 py-3 text-sm font-black text-clay">
          The pricing tables look empty. If you have not run the one-time SQL
          migration described in the README, the builder will show a “Pricing
          not configured” banner until you do.
        </div>
      ) : null}

      <div className="space-y-8">
        <PricingItemEditor items={catalog.items} />
        <PricingLevelEditor levels={catalog.levels} />
        <ContingencyEditor contingencies={catalog.contingencies} />
        <ProjectTypeEditor projectTypes={catalog.projectTypes} />
        <CrewEditor crew={crew} />
        <SettingsEditor settings={catalog.settings} />
      </div>
    </AppShell>
  );
}