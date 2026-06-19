// Shared building blocks for the pricing-admin editor components, so the five
// editors don't each redefine the same Field wrapper and button class strings.
// These mirror the look of the rest of the app (form-input, focus-ring, the
// pine/cream/whitewarm tokens) so the admin page feels like the rest of the app.

import type React from "react";

export function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-sm font-black text-deep-pine">{label}</span>
      {children}
    </label>
  );
}

// Primary save/add button.
export const primaryButtonClass =
  "rounded-full bg-pine px-5 py-3 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60";

// Secondary (neutral) button — cancel / done editing.
export const secondaryButtonClass =
  "rounded-full border border-pine/20 bg-whitewarm px-5 py-3 text-sm font-black text-deep-pine hover:bg-pine/10";

// Danger-style toggle (deactivate / activate).
export const toggleButtonClass =
  "rounded-full border border-pine/20 px-4 py-2 text-xs font-black text-deep-pine hover:bg-pine/10";

// Small inline status message shown after a save succeeds or fails.
export function SaveNote({
  message,
  isError
}: {
  message: string;
  isError?: boolean;
}) {
  if (!message) return null;
  return (
    <p
      className={
        isError
          ? "rounded-soft border border-clay/30 bg-clay/10 px-3 py-2 text-sm font-black text-clay"
          : "rounded-soft border border-sage/40 bg-sage/20 px-3 py-2 text-sm font-black text-deep-pine"
      }
    >
      {message}
    </p>
  );
}

// A small badge showing whether a row is active or deactivated.
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-sage/30 px-3 py-1 text-xs font-black text-deep-pine"
          : "rounded-full bg-stone/40 px-3 py-1 text-xs font-black text-charcoal/60"
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}