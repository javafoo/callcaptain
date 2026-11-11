import Link from "next/link";
import { Icon } from "@/components/ui";
import { Container, Logo } from "./primitives";

const GITHUB = "https://github.com/javafoo/callcaptain";

/** Slim strip above the nav: this build is a hackathon entry on PayPal's sandbox. */
export function HackathonBanner() {
  return (
    <div className="bg-ink-950 px-4 py-2 text-center text-xs text-ink-300">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-brand-500 align-middle" aria-hidden />
      PayPal AI Hackathon build <span aria-hidden>·</span> runs on PayPal sandbox, no real money moves
    </div>
  );
}

const PRODUCT = [
  { href: "/call", label: "Try a call with Ava" },
  { href: "/setup", label: "Set up your business" },
  { href: "/dashboard", label: "Open dashboard" },
];

const PAGE = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#payments", label: "PayPal" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteFooter() {
  return (
    <footer className="bg-ink-950 text-ink-300">
      <Container className="py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm">
              The AI after-hours dispatcher for plumbing, water heater and HVAC companies. Ava answers, keeps the caller safe and secures the visit with PayPal before the truck
              rolls.
            </p>
            <a
              href={GITHUB}
              className="mt-5 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-white transition hover:text-brand-200"
            >
              <Icon name="github" className="h-4 w-4" />
              Source on GitHub · MIT license
            </a>
          </div>
          <nav aria-label="Product">
            <h2 className="text-sm font-semibold text-white">Product</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PRODUCT.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="rounded transition hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="On this page">
            <h2 className="text-sm font-semibold text-white">On this page</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PAGE.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="rounded transition hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Built for the PayPal AI Hackathon · runs on PayPal sandbox, no real money moves.</p>
          <p>Harbor Plumbing &amp; Heating and Marcus are fictional examples.</p>
        </div>
      </Container>
    </footer>
  );
}
