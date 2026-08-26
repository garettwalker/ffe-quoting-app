import type {
  QuoteCalculationResult,
  QuoteFormState,
  ServiceQuoteCalculationResult
} from "@/lib/types";

// The calculation snapshot. A new-build quote stores a QuoteCalculationResult;
// a service-call quote stores a ServiceQuoteCalculationResult. The union keeps
// the same localStorage slot working for both — callers branch on quote.quoteType
// to read type-specific fields (baseRate / clientFacingLines are new-build only).
export type StoredCalculation = QuoteCalculationResult | ServiceQuoteCalculationResult;

export type StoredQuote = {
  quote: QuoteFormState;
  result: StoredCalculation;
  savedAt: string;
  // When set, this active quote is tied to an existing Supabase quote row,
  // so saving should update that row instead of inserting a new one.
  savedQuoteId?: string | null;
};

const ACTIVE_QUOTE_KEY = "ffe-active-quote";

export function saveActiveQuote(
  quote: QuoteFormState,
  result: StoredCalculation,
  savedQuoteId?: string | null
) {
  if (typeof window === "undefined") return;

  const storedQuote: StoredQuote = {
    quote,
    result,
    savedAt: new Date().toISOString(),
    savedQuoteId: savedQuoteId ?? null
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