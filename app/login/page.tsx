import Image from "next/image";

import { LoginForm } from "@/components/login-form";

// Public login page. Phase A: the app is still open, so this is reachable but
// nothing requires it yet. Phase B redirects unauthenticated users here.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Image
            src="/ffe-logo.png"
            alt="Freedom Family Electric logo"
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-contain"
          />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-clay">
              Quote App
            </p>
            <p className="text-base font-black leading-tight text-deep-pine">
              Freedom Family Electric
            </p>
          </div>
        </div>

        <section className="rounded-xl2 border border-pine/10 bg-whitewarm/75 p-6 shadow-soft">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-clay">
            Sign in
          </p>
          <h1 className="font-display text-4xl font-bold tracking-[-0.035em] text-moss md:text-5xl">
            Login
          </h1>
          <p className="mt-3 text-base leading-7 text-charcoal/75">
            Sign in to manage quotes, invoices, and the crew schedule.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}