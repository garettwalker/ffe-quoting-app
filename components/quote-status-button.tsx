"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { QuoteStatus } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-pine text-whitewarm hover:bg-deep-pine",
  secondary:
    "border border-pine/20 text-deep-pine hover:bg-pine hover:text-whitewarm",
  ghost: "border border-pine/15 text-deep-pine/45 cursor-not-allowed"
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-3"
};

export function QuoteStatusButton({
  quoteId,
  newStatus,
  label,
  variant = "secondary",
  size = "md",
  disabled = false
}: {
  quoteId: string;
  newStatus: QuoteStatus;
  label: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleClick() {
    if (disabled || isWorking) return;

    setIsWorking(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("quotes")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", quoteId);

    setIsWorking(false);

    if (error) {
      setErrorMessage(`${label} failed: ${error.message}`);
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isWorking}
      title={errorMessage || undefined}
      className={`rounded-full ${SIZE_CLASSES[size]} text-center font-black shadow-card transition disabled:cursor-default disabled:opacity-60 ${
        VARIANT_CLASSES[disabled ? "ghost" : variant]
      }`}
    >
      {isWorking ? `${label}...` : label}
    </button>
  );
}