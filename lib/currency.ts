export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

export function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatPercent(multiplier: number): string {
  return `${Math.round(multiplier * 100)}%`;
}

// Format an ISO timestamp (or null) as e.g. "Jun 19, 2026". Returns an empty
// string for null/invalid so callers can render blank cells without guards.
// Matches the date formatting already used on the printable pages.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
