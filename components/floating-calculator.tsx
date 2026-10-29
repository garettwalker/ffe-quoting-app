"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "basic" | "area" | "percent";
type Operator = "+" | "-" | "×" | "÷";

function applyOperator(left: number, right: number, operator: Operator): number {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "×":
      return left * right;
    case "÷":
      return right === 0 ? 0 : left / right;
    default:
      return right;
  }
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// A fixed-position calculator for the quote builders. It hovers over the page
// and stays in the corner while the form scrolls. Results can be copied, or
// inserted into the last quote field that had focus.
export function FloatingCalculator() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("basic");

  // Basic calculator state.
  const [display, setDisplay] = useState("0");
  const [previous, setPrevious] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [fresh, setFresh] = useState(true);
  const [expression, setExpression] = useState("");
  const [tape, setTape] = useState<string[]>([]);

  // Area mode (feet / inches).
  const [lengthFt, setLengthFt] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [widthFt, setWidthFt] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [waste, setWaste] = useState("0");

  // Percent mode.
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");

  const [notice, setNotice] = useState("");
  const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    function onFocus(event: FocusEvent) {
      const element = event.target;
      if (
        !(element instanceof HTMLInputElement) &&
        !(element instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      if (element.closest("[data-floating-calculator]")) return;
      if (element.readOnly || element.disabled) return;
      // Only numeric fields are safe targets. This keeps a result from landing
      // in a name, address, or date field.
      if (
        element.type !== "number" &&
        element.inputMode !== "numeric" &&
        element.inputMode !== "decimal"
      ) {
        return;
      }
      targetRef.current = element;
    }
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  function flashNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 1800);
  }

  function pressDigit(digit: string) {
    if (fresh && previous == null) setExpression("");
    setDisplay((current) => {
      if (fresh) return digit;
      if (current === "0") return digit;
      return current.length >= 12 ? current : current + digit;
    });
    setFresh(false);
  }

  function pressDot() {
    setDisplay((current) => {
      if (fresh) return "0.";
      return current.includes(".") ? current : current + ".";
    });
    setFresh(false);
  }

  function chooseOperator(next: Operator) {
    const value = toNumber(display);
    if (previous != null && operator && !fresh) {
      const result = applyOperator(previous, value, operator);
      setPrevious(result);
      setDisplay(String(result));
      setExpression(`${formatNumber(result)} ${next}`);
    } else {
      setPrevious(value);
      setExpression(`${formatNumber(value)} ${next}`);
    }
    setOperator(next);
    setFresh(true);
  }

  function equals() {
    if (previous == null || !operator) return;
    const value = toNumber(display);
    const result = applyOperator(previous, value, operator);
    const line = `${formatNumber(previous)} ${operator} ${formatNumber(value)} = ${formatNumber(result)}`;
    setExpression(`${formatNumber(previous)} ${operator} ${formatNumber(value)} =`);
    setDisplay(String(result));
    setTape((current) => [line, ...current].slice(0, 4));
    setPrevious(null);
    setOperator(null);
    setFresh(true);
  }

  function clearAll() {
    setDisplay("0");
    setPrevious(null);
    setOperator(null);
    setFresh(true);
    setExpression("");
  }

  function backspace() {
    setDisplay((current) => {
      if (fresh) return "0";
      return current.length <= 1 ? "0" : current.slice(0, -1);
    });
  }

  function percentOfDisplay() {
    setDisplay(String(toNumber(display) / 100));
    setFresh(true);
  }

  const areaSqFt =
    (toNumber(lengthFt) + toNumber(lengthIn) / 12) *
    (toNumber(widthFt) + toNumber(widthIn) / 12) *
    (1 + toNumber(waste) / 100);
  const percentOfAmount = (toNumber(amount) * toNumber(percent)) / 100;
  const percentTotal = toNumber(amount) + percentOfAmount;

  const currentResult =
    mode === "area"
      ? areaSqFt
      : mode === "percent"
        ? percentOfAmount
        : toNumber(display);

  function resultText(): string {
    if (mode === "area") return `${formatNumber(areaSqFt, 2)} sf`;
    if (mode === "percent") return formatCurrency(percentOfAmount);
    return formatNumber(toNumber(display));
  }

  async function copyResult() {
    const text =
      mode === "area"
        ? String(Math.round(areaSqFt))
        : mode === "percent"
          ? toNumber(percentOfAmount.toFixed(2)).toString()
          : display;
    try {
      await navigator.clipboard.writeText(text);
      flashNotice("Copied");
    } catch {
      flashNotice("Copy is blocked here. Select the result instead.");
    }
  }

  function insertResult() {
    const target = targetRef.current;
    if (!target) {
      flashNotice("Click a quote field first, then Insert.");
      return;
    }
    const value = String(
      mode === "area" ? Math.round(areaSqFt) : Number(currentResult.toFixed(2))
    );
    const prototype =
      target instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return;
    setter.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
    flashNotice("Inserted");
  }

  return (
    <div data-floating-calculator>
      {open ? (
        <section
          aria-label="Calculator"
          className="fixed bottom-24 right-4 z-50 max-h-[calc(100vh-8rem)] w-[calc(100vw-2rem)] max-w-[334px] overflow-y-auto rounded-xl1 border border-pine/15 bg-whitewarm shadow-soft"
        >
          <div className="flex items-center justify-between gap-2 border-b border-pine/10 px-3 py-2">
            <p className="text-sm font-black text-deep-pine">Calculator</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close calculator"
              className="rounded-full px-2 py-1 text-lg font-bold leading-none text-charcoal/50 hover:bg-pine/10 hover:text-deep-pine"
            >
              ×
            </button>
          </div>

          <div className="flex gap-1 border-b border-pine/10 bg-cream/60 px-2 py-1.5">
            {(
              [
                ["basic", "Basic"],
                ["area", "Area"],
                ["percent", "%"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={
                  mode === value
                    ? "rounded-full bg-pine px-3 py-1 text-[11px] font-black text-whitewarm"
                    : "rounded-full px-3 py-1 text-[11px] font-black text-charcoal/60 hover:bg-pine/10"
                }
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "basic" ? (
            <>
              <div className="mx-3 mt-2 rounded-soft border border-pine/10 bg-cream px-3 py-2 text-right">
                <p className="min-h-4 text-[11px] font-bold text-charcoal/50">
                  {expression}
                </p>
                <p
                  aria-live="polite"
                  className="break-all text-3xl font-bold tracking-[-0.02em] text-deep-pine"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatNumber(toNumber(display), 8)}
                </p>
              </div>

              {tape.length > 0 ? (
                <p className="mx-3 mt-1 truncate text-[10px] font-bold text-charcoal/45">
                  {tape[0]}
                </p>
              ) : null}

              <div className="grid grid-cols-4 gap-1.5 p-3">
                {[
                  { label: "C", onClick: clearAll, tone: "fn" },
                  { label: "⌫", onClick: backspace, tone: "fn" },
                  { label: "%", onClick: percentOfDisplay, tone: "fn" },
                  { label: "÷", onClick: () => chooseOperator("÷"), tone: "op" },
                  { label: "7", onClick: () => pressDigit("7") },
                  { label: "8", onClick: () => pressDigit("8") },
                  { label: "9", onClick: () => pressDigit("9") },
                  { label: "×", onClick: () => chooseOperator("×"), tone: "op" },
                  { label: "4", onClick: () => pressDigit("4") },
                  { label: "5", onClick: () => pressDigit("5") },
                  { label: "6", onClick: () => pressDigit("6") },
                  { label: "−", onClick: () => chooseOperator("-"), tone: "op" },
                  { label: "1", onClick: () => pressDigit("1") },
                  { label: "2", onClick: () => pressDigit("2") },
                  { label: "3", onClick: () => pressDigit("3") },
                  { label: "+", onClick: () => chooseOperator("+"), tone: "op" },
                  { label: "0", onClick: () => pressDigit("0") },
                  { label: ".", onClick: pressDot },
                  { label: "=", onClick: equals, tone: "eq" },
                  { label: "Use", onClick: insertResult, tone: "use" }
                ].map((key) => (
                  <button
                    key={key.label}
                    type="button"
                    onClick={key.onClick}
                    className={
                      "min-h-10 rounded-soft border text-sm font-black " +
                      (key.tone === "fn"
                        ? "border-pine/10 bg-cream text-clay"
                        : key.tone === "op"
                          ? "border-pine/10 bg-cream text-deep-pine"
                          : key.tone === "eq"
                            ? "border-pine bg-pine text-whitewarm"
                            : key.tone === "use"
                              ? "border-clay bg-clay text-whitewarm"
                              : "border-pine/15 bg-whitewarm text-charcoal")
                    }
                  >
                    {key.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 p-3 pt-0">
                <button
                  type="button"
                  onClick={copyResult}
                  className="flex-1 rounded-soft border border-pine/20 px-3 py-2 text-xs font-black text-deep-pine hover:bg-pine/10"
                >
                  Copy result
                </button>
                <button
                  type="button"
                  onClick={insertResult}
                  className="flex-1 rounded-soft bg-pine px-3 py-2 text-xs font-black text-whitewarm hover:bg-deep-pine"
                >
                  Use in field
                </button>
              </div>
            </>
          ) : null}

          {mode === "area" ? (
            <div className="p-3">
              <p className="text-[11px] font-bold text-charcoal/55">
                Feet and inches, with optional waste. The result is square feet.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-clay">
                  Length ft
                  <input
                    type="number"
                    inputMode="decimal"
                    value={lengthFt}
                    onChange={(event) => setLengthFt(event.target.value)}
                    className="focus-ring h-9 rounded-soft border border-pine/20 bg-cream px-2 text-sm font-bold text-charcoal"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-clay">
                  Length in
                  <input
                    type="number"
                    inputMode="decimal"
                    value={lengthIn}
                    onChange={(event) => setLengthIn(event.target.value)}
                    className="focus-ring h-9 rounded-soft border border-pine/20 bg-cream px-2 text-sm font-bold text-charcoal"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-clay">
                  Width ft
                  <input
                    type="number"
                    inputMode="decimal"
                    value={widthFt}
                    onChange={(event) => setWidthFt(event.target.value)}
                    className="focus-ring h-9 rounded-soft border border-pine/20 bg-cream px-2 text-sm font-bold text-charcoal"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-clay">
                  Width in
                  <input
                    type="number"
                    inputMode="decimal"
                    value={widthIn}
                    onChange={(event) => setWidthIn(event.target.value)}
                    className="focus-ring h-9 rounded-soft border border-pine/20 bg-cream px-2 text-sm font-bold text-charcoal"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-clay">
                  Waste %
                  <input
                    type="number"
                    inputMode="decimal"
                    value={waste}
                    onChange={(event) => setWaste(event.target.value)}
                    className="focus-ring h-9 rounded-soft border border-pine/20 bg-cream px-2 text-sm font-bold text-charcoal"
                  />
                </label>
              </div>
              <div className="mt-3 rounded-soft border border-pine/10 bg-cream px-3 py-2 text-right">
                <p className="text-[11px] font-bold text-charcoal/50">
                  {formatNumber(areaSqFt, 2)} square feet
                </p>
                <p className="text-2xl font-bold text-deep-pine">
                  {formatNumber(Math.round(areaSqFt))} sf
                </p>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={copyResult}
                  className="flex-1 rounded-soft border border-pine/20 px-3 py-2 text-xs font-black text-deep-pine hover:bg-pine/10"
                >
                  Copy sf
                </button>
                <button
                  type="button"
                  onClick={insertResult}
                  className="flex-1 rounded-soft bg-pine px-3 py-2 text-xs font-black text-whitewarm hover:bg-deep-pine"
                >
                  Use in field
                </button>
              </div>
            </div>
          ) : null}

          {mode === "percent" ? (
            <div className="p-3">
              <p className="text-[11px] font-bold text-charcoal/55">
                Percent of an amount, for markup, tax, or a deposit.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-clay">
                  Amount $
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="focus-ring h-9 rounded-soft border border-pine/20 bg-cream px-2 text-sm font-bold text-charcoal"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-clay">
                  Percent %
                  <input
                    type="number"
                    inputMode="decimal"
                    value={percent}
                    onChange={(event) => setPercent(event.target.value)}
                    className="focus-ring h-9 rounded-soft border border-pine/20 bg-cream px-2 text-sm font-bold text-charcoal"
                  />
                </label>
              </div>
              <div className="mt-3 rounded-soft border border-pine/10 bg-cream px-3 py-2 text-right">
                <p className="text-[11px] font-bold text-charcoal/50">
                  {toNumber(percent)}% of {formatCurrency(toNumber(amount))}
                </p>
                <p className="text-2xl font-bold text-deep-pine">
                  {formatCurrency(percentOfAmount)}
                </p>
                <p className="mt-1 text-[11px] font-bold text-charcoal/55">
                  With percent: {formatCurrency(percentTotal)}
                </p>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={copyResult}
                  className="flex-1 rounded-soft border border-pine/20 px-3 py-2 text-xs font-black text-deep-pine hover:bg-pine/10"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={insertResult}
                  className="flex-1 rounded-soft bg-pine px-3 py-2 text-xs font-black text-whitewarm hover:bg-deep-pine"
                >
                  Use in field
                </button>
              </div>
            </div>
          ) : null}

          <div className="border-t border-pine/10 px-3 py-2">
            <p className="text-[10px] font-bold leading-4 text-charcoal/50">
              {notice ||
                "Stays in the corner while you scroll. Click a quote field first to use a result there."}
            </p>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close calculator" : "Open calculator"}
        aria-expanded={open}
        className="fixed bottom-5 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-pine text-2xl font-bold text-whitewarm shadow-soft transition hover:bg-deep-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
      >
        {open ? "×" : "="}
      </button>
    </div>
  );
}
