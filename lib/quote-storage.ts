import type { QuoteCalculationResult, QuoteFormState } from "@/lib/types";

export type StoredQuote = {
  quote: QuoteFormState;
  result: QuoteCalculationResult;
  savedAt: string;
};

const ACTIVE_QUOTE_KEY = "ffe-active-quote";

export function saveActiveQuote(quote: QuoteFormState, result: QuoteCalculationResult) {
  if (typeof window === "undefined") return;

  const storedQuote: StoredQuote = {
    quote,
    result,
    savedAt: new Date().toISOString()
  };

  window.localStorage.setItem(ACTIVE_QUOTE_KEY, JSON.stringify(storedQuote));
}

export function getActiveQuote(): StoredQuote | null {
  if (typeof window === "undefined") return null;

  const rawQuote = window.localStorage.getItem(ACTIVE_QUOTE_KEY);

  if (!rawQuote) return null;

  try {
    return JSON.parse(rawQuote) as StoredQuote;
  } catch {
    return null;
  }
}

export function clearActiveQuote() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(ACTIVE_QUOTE_KEY);
}
