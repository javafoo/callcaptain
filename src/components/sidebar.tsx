"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, cx } from "./ui";

const NAV = [
  { href: "/", label: "Live call", icon: "phone" as const },
  { href: "/dashboard", label: "Jobs", icon: "jobs" as const },
  { href: "/setup", label: "Agent setup", icon: "sliders" as const },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
        <Icon name="shield" className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-white">Call Captain</span>
    </Link>
  );
}

export function Sidebar({ businessName }: { businessName: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const initials = businessName
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-ink-900 lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active(n.href) ? "bg-ink-800 text-white" : "text-ink-300 hover:bg-ink-800/60 hover:text-white",
              )}
            >
              <Icon name={n.icon} className={cx("h-[18px] w-[18px]", active(n.href) ? "text-brand-500" : "")} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-ink-800 p-4">
          <div className="flex items-center gap-2 rounded-lg bg-ink-800/70 px-3 py-2 text-xs text-ink-300">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            PayPal sandbox connected
          </div>
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-white">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{businessName}</p>
              <p className="text-xs text-ink-300">Owner</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 bg-ink-900 lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <span className="flex items-center gap-1.5 text-xs text-ink-300">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> Sandbox
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium", active(n.href) ? "bg-ink-800 text-white" : "text-ink-300")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
