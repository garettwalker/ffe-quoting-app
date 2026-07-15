"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Small client logout control shown in the app header. Clears the Supabase
// session and returns to /login.
export function LogoutButton() {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);

  async function handleClick() {
    if (isWorking) return;
    setIsWorking(true);
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setIsWorking(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isWorking}
      className="rounded-full border border-pine/20 px-4 py-2 text-center text-sm font-bold text-charcoal/70 hover:bg-pine/10 hover:text-deep-pine disabled:opacity-60"
    >
      {isWorking ? "..." : "Logout"}
    </button>
  );
}