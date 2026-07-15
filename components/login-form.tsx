"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Email + password sign-in. Calls Supabase Auth directly from the browser
// (the anon key is public; the password goes to Supabase's auth endpoint, not
// our server). On success, replace to the dashboard and refresh so any
// server-component reads pick up the new session.
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isWorking) return;
    setIsWorking(true);
    setErrorMessage("");

    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setIsWorking(false);

    if (error) {
      setErrorMessage(
        error.message || "Sign in failed. Check your email and password."
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-2">
        <span className="text-sm font-black uppercase tracking-[0.12em] text-clay">
          Email
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-soft border border-pine/20 bg-cream px-4 py-3 font-bold text-deep-pine focus-ring"
        />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-black uppercase tracking-[0.12em] text-clay">
          Password
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-soft border border-pine/20 bg-cream px-4 py-3 font-bold text-deep-pine focus-ring"
        />
      </label>
      <button
        type="submit"
        disabled={isWorking}
        className="mt-2 rounded-full bg-pine px-5 py-3 text-center font-black text-whitewarm shadow-card hover:bg-deep-pine disabled:cursor-default disabled:opacity-60"
      >
        {isWorking ? "Signing in..." : "Sign in"}
      </button>
      {errorMessage ? (
        <p className="text-sm font-bold leading-5 text-clay">{errorMessage}</p>
      ) : null}
    </form>
  );
}