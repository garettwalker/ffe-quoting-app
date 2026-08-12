"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";

// Slide-out main menu for the app header. The header used to cram every tool
// into a single row of links, which ran out of room as tools were added. Now
// the header holds just the brand, a "New Quote" button, and a Menu button;
// clicking Menu slides a 320px panel in from the right with every tool grouped
// (Work / Money / Setup) and a one-line description under each, so the header
// stays clean and the tools stay discoverable. The active tool is highlighted
// from the current pathname. Closes on Escape, on backdrop click, and on
// navigating to a tool. See /tmp/ffe-mockups/mockup-nav.html for the approved
// design (house palette, no em dashes in copy).

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

// Stroke-based 18px icons (currentColor) so they stay crisp and match the
// brand ink without shipping an icon library.
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  quotes: (
    <Icon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Icon>
  ),
  schedule: (
    <Icon>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <path d="M8 14h3v3H8z" />
    </Icon>
  ),
  receivables: (
    <Icon>
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Icon>
  ),
  email: (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Icon>
  ),
  pricing: (
    <Icon>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2.2" fill="whitewarm" />
      <circle cx="15" cy="12" r="2.2" fill="whitewarm" />
      <circle cx="8" cy="18" r="2.2" fill="whitewarm" />
    </Icon>
  )
};

const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Work",
    items: [
      {
        href: "/",
        label: "Dashboard",
        description: "Summary of everything in motion",
        icon: ICONS.dashboard
      },
      {
        href: "/quotes",
        label: "Quotes",
        description: "Drafts, prepared, accepted pipeline",
        icon: ICONS.quotes
      },
      {
        href: "/schedule",
        label: "Schedule",
        description: "Crews and assignments",
        icon: ICONS.schedule
      }
    ]
  },
  {
    label: "Money",
    items: [
      {
        href: "/receivables",
        label: "Receivables",
        description: "Outstanding and paid invoices",
        icon: ICONS.receivables
      },
      {
        href: "/email-log",
        label: "Email Log",
        description: "Quotes and invoices sent",
        icon: ICONS.email
      }
    ]
  },
  {
    label: "Setup",
    items: [
      {
        href: "/pricing-admin",
        label: "Pricing Admin",
        description: "Line items, levels, contingencies",
        icon: ICONS.pricing
      }
    ]
  }
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function NavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on Escape, and lock body scroll while the panel is open so the page
  // behind does not jump.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="nav-panel"
        aria-label="Open menu"
        className="focus-ring inline-flex items-center gap-2 rounded-full border border-pine/15 bg-whitewarm px-4 py-3 text-sm font-bold text-deep-pine transition-colors hover:bg-cream"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span>Menu</span>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-clay transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Backdrop. Always rendered so the opacity transition runs; pointer
          events are off when closed so it never blocks the page. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-[55] bg-charcoal/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        id="nav-panel"
        aria-label="Main menu"
        className={`fixed top-0 right-0 z-[60] flex h-screen w-80 max-w-[86vw] flex-col border-l border-pine/10 bg-whitewarm shadow-soft transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-pine/8 px-6 py-5">
          <p className="font-display text-xl font-bold text-deep-pine">Menu</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-pine/15 bg-cream text-lg text-deep-pine transition-colors hover:bg-sand"
          >
            &#10005;
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {GROUPS.map((group) => (
            <div key={group.label} className="my-3">
              <p className="mx-2 mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-clay">
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                      active
                        ? "bg-pine text-whitewarm"
                        : "text-charcoal hover:bg-cream"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 flex-none place-items-center rounded-soft ${
                        active ? "bg-whitewarm/15 text-whitewarm" : "bg-cream text-deep-pine"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-bold leading-tight">
                        {item.label}
                      </span>
                      <span
                        className={`mt-0.5 text-xs leading-snug ${
                          active ? "text-whitewarm/70" : "text-charcoal/60"
                        }`}
                      >
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-pine/8 p-4">
          <LogoutButton className="focus-ring w-full rounded-soft border border-pine/15 bg-cream px-4 py-3 text-sm font-black text-clay transition-colors hover:bg-sand disabled:opacity-60" />
        </div>
      </aside>
    </>
  );
}