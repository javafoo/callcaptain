import Script from "next/script";
import { Suspense } from "react";
import { currentWorkspace } from "@/lib/workspace";

export const metadata = { title: { absolute: "Harbor Plumbing & Heating · San Jose plumbers (demo site)" } };

/**
 * A pretend contractor website, used two ways in the demo:
 *  1. Agent setup → "Read my website" imports this page.
 *  2. It carries the one-line embed snippet, so the "Talk to us now" button shows up here.
 * Harbor Plumbing & Heating is fictional.
 */

const SERVICES = [
  ["Emergency plumbing", "Burst pipes, major leaks, overflowing toilets and sewer backups, 24 hours a day."],
  ["Water heaters", "Repair and replacement of tank and tankless water heaters. We service Rheem, Bradford White, A. O. Smith and Rinnai."],
  ["Drain cleaning", "Kitchen, bath and main line clogs, with camera inspection."],
  ["Heating", "Furnace repair and no-heat calls for homes."],
];

export default function DemoSite() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
        Demo website for a fictional business, used to show Call Captain&apos;s website import and embed.
      </div>
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <p className="text-lg font-bold text-sky-900">Harbor Plumbing &amp; Heating</p>
          <nav className="hidden gap-6 text-sm text-slate-600 sm:flex">
            <a href="#services">Services</a>
            <a href="#area">Service area</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <p className="text-sm font-semibold text-sky-900">(408) 555-0142</p>
        </div>
      </header>

      <section className="bg-sky-900 text-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h1 className="max-w-2xl text-4xl font-bold leading-tight">Family-owned plumbers for San Jose and Santa Clara County since 2009.</h1>
          <p className="mt-4 max-w-xl text-sky-100">Licensed, insured and on call 24/7 for emergencies. Upfront quotes before any work starts.</p>
          <p className="mt-6 text-sm text-sky-200">CA License #1009847 · Bonded and insured</p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-14">
        <section id="services">
          <h2 className="text-2xl font-bold text-slate-900">Services</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {SERVICES.map(([t, d]) => (
              <div key={t} className="rounded-lg border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">We work on single-family homes, townhomes and condos. We do not take commercial or new-construction jobs.</p>
        </section>

        <section id="area">
          <h2 className="text-2xl font-bold text-slate-900">Service area</h2>
          <p className="mt-2 text-slate-600">
            We serve San Jose and all of Santa Clara County: Santa Clara, Sunnyvale, Mountain View, Cupertino, Campbell, Los Gatos, Milpitas, Morgan Hill and Gilroy.
          </p>
        </section>

        <section id="pricing">
          <h2 className="text-2xl font-bold text-slate-900">Pricing</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
            <li>Weekday service call: $89, credited toward the repair.</li>
            <li>After-hours and weekend emergency service call: $149, credited toward the repair.</li>
            <li>Free cancellation until the technician is on the way. After that a $79 trip fee applies.</li>
            <li>Every repair carries a one-year parts and labor warranty.</li>
            <li>We accept PayPal, Venmo and all major cards. Financing available on water heater replacements.</li>
          </ul>
        </section>

        <section id="faq">
          <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          <dl className="mt-3 space-y-4 text-slate-600">
            <div>
              <dt className="font-semibold text-slate-900">Where is my main water shutoff?</dt>
              <dd>Usually where the water line enters the house, often near the front hose bib or in the garage. For a leaking water heater, close the valve on the cold pipe above the tank.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Do you give quotes over the phone?</dt>
              <dd>Send us a photo and we can often tell you if it&apos;s a quick fix. Final quotes are given on site before any work starts.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">What are your hours?</dt>
              <dd>Office hours are Monday to Friday, 7 AM to 6 PM. Emergency service is available 24/7.</dd>
            </div>
          </dl>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">© Harbor Plumbing &amp; Heating (fictional) · San Jose, CA</footer>

      {/* The one line a contractor pastes into their site, pointed at this visitor's own workspace. */}
      <Suspense>
        <Embed />
      </Suspense>
    </div>
  );
}

async function Embed() {
  const workspace = await currentWorkspace();
  return <Script src="/embed.js" data-business={workspace ?? undefined} data-label="Plumbing emergency? Talk to us now" strategy="afterInteractive" />;
}
