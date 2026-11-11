"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { Glyph } from "./icons";
import { Logo } from "./primitives";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#paypal", label: "PayPal" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900">
      <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Call Captain home" className="rounded-lg">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-8 text-sm font-medium text-ink-300 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded transition hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/15"
          >
            <span className="sm:hidden">Dashboard</span>
            <span className="hidden sm:inline">Open dashboard</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 transition hover:bg-white/10 hover:text-white md:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <Glyph name={open ? "close" : "menu"} className="h-5 w-5" />
          </button>
        </div>
      </nav>

      <div id="site-menu" className={cx("border-t border-white/10 md:hidden", open ? "block" : "hidden")}>
        <ul className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-base font-medium text-ink-300 transition hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
