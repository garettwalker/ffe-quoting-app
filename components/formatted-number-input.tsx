"use client";

import { useState } from "react";

// A text input that displays its numeric value with thousands separators
// (e.g. 45000 -> "45,000") for readability, but switches to plain digits while
// focused so typing stays easy. Pass the canonical number via `value` and
// receive parsed numbers via `onChange`. Set `allowDecimal` for dollar amounts.
export function FormattedNumberInput({
  value,
  onChange,
  placeholder,
  className,
  allowDecimal = false,
  min,
  max
}: {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  allowDecimal?: boolean;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  function handleChange(raw: string) {
    const cleaned = allowDecimal
      ? raw.replace(/[^0-9.]/g, "")
      : raw.replace(/[^0-9]/g, "");

    setDraft(cleaned);

    if (cleaned === "") {
      onChange(0);
      return;
    }

    const parsed = allowDecimal
      ? parseFloat(cleaned)
      : parseInt(cleaned, 10);

    if (!Number.isFinite(parsed)) {
      onChange(0);
      return;
    }

    let clamped = parsed;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);

    onChange(clamped);
  }

  function handleFocus() {
    setFocused(true);
    // Show plain digits while editing (no commas) for easier typing.
    setDraft(value === 0 ? "" : String(value));
  }

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={focused ? draft : formatForDisplay(value, allowDecimal)}
      placeholder={placeholder}
      onChange={(event) => handleChange(event.target.value)}
      onFocus={handleFocus}
      onBlur={() => setFocused(false)}
      className={className}
    />
  );
}

function formatForDisplay(value: number, allowDecimal: boolean): string {
  if (!value || !Number.isFinite(value)) return "";
  if (allowDecimal) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }
  return Math.round(value).toLocaleString("en-US");
}