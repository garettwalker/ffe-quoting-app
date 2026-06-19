"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleDelete() {
    setIsDeleting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("quotes")
      .delete()
      .eq("id", quoteId);

    if (error) {
      setErrorMessage(`Delete failed: ${error.message}`);
      setIsDeleting(false);
      setConfirming(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-clay/25 px-5 py-3 font-black text-clay hover:bg-clay hover:text-whitewarm"
      >
        Delete Quote
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl1 border border-clay/25 bg-cream/70 p-4">
      <p className="text-sm font-black text-clay">
        Delete this quote permanently?
      </p>
      <p className="text-sm font-bold text-charcoal/70">
        This removes it from the database and cannot be undone.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-full bg-clay px-5 py-3 font-black text-whitewarm hover:bg-clay/90 disabled:opacity-60"
        >
          {isDeleting ? "Deleting..." : "Yes, Delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isDeleting}
          className="rounded-full border border-pine/20 px-5 py-3 font-black text-deep-pine hover:bg-pine hover:text-whitewarm"
        >
          Cancel
        </button>
      </div>
      {errorMessage ? (
        <p className="break-words text-sm font-bold text-clay">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}