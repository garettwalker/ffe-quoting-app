import Image from "next/image";
import Link from "next/link";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-pine/10 bg-cream/90 backdrop-blur-xl">
        <div className="app-container flex min-h-20 items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 focus-ring rounded-soft">
            <Image
              src="/ffe-logo.png"
              alt="Freedom Family Electric logo"
              width={58}
              height={58}
              priority
              className="h-14 w-14 rounded-full object-contain"
            />
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-clay">
                Quote App
              </p>
              <p className="text-lg font-black leading-tight text-deep-pine">
                Freedom Family Electric
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <Link
              href="/"
              className="rounded-full px-4 py-2 text-sm font-bold text-charcoal/70 hover:bg-pine/10 hover:text-deep-pine"
            >
              Dashboard
            </Link>
            <Link
              href="/quotes/new"
              className="rounded-full bg-pine px-5 py-3 text-sm font-black text-whitewarm shadow-card hover:bg-deep-pine"
            >
              Start New Quote
            </Link>
          </nav>
        </div>
      </header>

      <main className="app-container py-10 md:py-14">{children}</main>
    </div>
  );
}
