import Image from "next/image";
import Link from "next/link";
import { NavMenu } from "@/components/nav-menu";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-50 border-b border-pine/10 bg-cream/90 backdrop-blur-xl">
        <div className="app-container flex min-h-20 flex-col items-start justify-between gap-4 py-4 md:flex-row md:items-center md:py-0">
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
              <p className="text-xs font-black uppercase tracking-[0.18em] text-clay md:text-sm">
                Quote App
              </p>
              <p className="text-base font-black leading-tight text-deep-pine md:text-lg">
                Freedom Family Electric
              </p>
            </div>
          </Link>

          <div className="flex w-full items-center gap-2 md:w-auto md:gap-3">
            <Link
              href="/quotes/new"
              className="focus-ring rounded-full bg-pine px-4 py-3 text-center text-sm font-black text-whitewarm shadow-card transition-colors hover:bg-deep-pine md:px-5"
            >
              + New Quote
            </Link>
            <NavMenu />
          </div>
        </div>
      </header>

      <main className="app-container py-8 md:py-14">{children}</main>
    </div>
  );
}
