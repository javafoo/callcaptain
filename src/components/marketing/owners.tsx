import type { ReactNode } from "react";
import { Icon, cx } from "@/components/ui";
import { Glyph, type GlyphName } from "./icons";
import { Container, SectionHeading } from "./primitives";

const EMBED = '<script src="https://callcaptain.vercel.app/embed.js" async></script>';

const SETUP: { icon: GlyphName; title: string; body: ReactNode }[] = [
  {
    icon: "sparkle",
    title: "Set up from your website",
    body: "Paste your URL. The AI fills in your services, service area, fees, policies and FAQs. You review it and save.",
  },
  {
    icon: "pin",
    title: "Service area by county",
    body: "Describe your area in plain words. The AI maps it to counties you can check, and every caller’s ZIP is tested against them.",
  },
  {
    icon: "globe",
    title: "Six languages",
    body: "English, Spanish, French, Portuguese, German and Hindi. Ava answers in the caller’s language and switches mid-call.",
  },
  {
    icon: "code",
    title: "A “Talk to us now” button",
    body: (
      <>
        One line of code adds it to your website. Visitors talk to Ava and approve the hold right on the page.
        <code className="mt-2.5 block rounded-lg bg-ink-900 px-3 py-2.5 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap text-brand-100">{EMBED}</code>
      </>
    ),
  },
  {
    icon: "forward",
    title: "Keep your number",
    body: "Forward your after-hours line to Ava’s phone number. Callers dial the number they already know. No new phones.",
  },
];

const NIGHTS: { icon: GlyphName; title: string; body: string }[] = [
  { icon: "bell", title: "Alerts on your phone", body: "Install the app on your phone and get a push notification the moment a job comes in." },
  { icon: "phone", title: "Ava phones your tech", body: "She calls your on-call technician, briefs him on the job, and he accepts by voice." },
  { icon: "sparkle", title: "An AI ticket for every call", body: "Summary, problem, urgency, safety steps taken and likely work, written when the call ends." },
  { icon: "ledger", title: "Jobs and payments in one place", body: "A jobs dashboard and a PayPal payments ledger, with refunds when you need them." },
];

export function Owners() {
  return (
    <section aria-labelledby="owners-title" className="bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="owners-title"
          eyebrow="For owners"
          title="Built for owners who don’t care about tech"
          lead="If you can paste a link and forward a phone line, you can put Ava on your night shift."
        />

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <FeatureList heading="Set up in one sitting" items={SETUP} />
          <SetupMock />
        </div>

        <div className="mt-20 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="lg:order-2">
            <FeatureList heading="Run your nights from your phone" items={NIGHTS} />
          </div>
          <AlertsMock />
        </div>
      </Container>
    </section>
  );
}

function FeatureList({ heading, items }: { heading: string; items: { icon: GlyphName; title: string; body: ReactNode }[] }) {
  return (
    <div>
      <h3 className="text-xl font-semibold tracking-tight text-gray-900">{heading}</h3>
      <ul role="list" className="mt-6 space-y-6">
        {items.map((f) => (
          <li key={f.title} className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <Glyph name={f.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h4 className="font-semibold text-gray-900">{f.title}</h4>
              <div className="mt-1 text-sm text-gray-600">{f.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LANGS = [
  { label: "English", lang: "en", on: true },
  { label: "Español", lang: "es", on: true },
  { label: "Français", lang: "fr", on: false },
  { label: "Português", lang: "pt", on: false },
  { label: "Deutsch", lang: "de", on: false },
  { label: "हिन्दी", lang: "hi", on: false },
];

/** Agent setup, after "Read my website" filled it in. Mirrors the real setup page. */
function SetupMock() {
  return (
    <div aria-hidden className="rounded-2xl bg-[#f4f6f8] p-3 ring-1 ring-gray-200 sm:p-5">
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-gray-200">
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Icon name="sparkle" className="h-4 w-4 text-brand-600" /> Set up from your website
          </p>
          <div className="mt-3 flex gap-2">
            <span className="min-w-0 flex-1 truncate rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">https://harborplumbing.example</span>
            <span className="shrink-0 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white">Read my website</span>
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-brand-700">
            <Icon name="check" className="h-3.5 w-3.5" /> Read 4 pages. Review the fields below, then save.
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2">
          <Field label="Services">plumbing, water heaters, heating and drains</Field>
          <Field label="Secure night visits with">PayPal hold on the call</Field>
          <Field label="After-hours service call">$149, credited to the repair</Field>
          <Field label="Trip fee after dispatch">$79</Field>
        </dl>
        <div className="space-y-4 border-t border-gray-100 px-5 py-4">
          <div>
            <p className="text-xs text-gray-500">Service area, in your own words</p>
            <p className="mt-0.5 text-sm text-gray-900">San Jose and the rest of Santa Clara County</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pr-2 pl-3 text-xs font-medium text-gray-700 ring-1 ring-gray-200 ring-inset">
              Santa Clara County, CA <Glyph name="close" className="h-3 w-3 text-gray-400" />
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500">Languages</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LANGS.map((l) => (
                <span
                  key={l.lang}
                  lang={l.lang}
                  className={cx(
                    "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                    l.on ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-white text-gray-600 ring-gray-200",
                  )}
                >
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/** The owner's phone overnight, plus the ticket Marcus gets. */
function AlertsMock() {
  return (
    <div aria-hidden className="relative">
      <div className="rounded-3xl bg-gradient-to-b from-ink-700 via-ink-900 to-ink-950 p-5 pb-16 shadow-xl sm:p-7 sm:pb-20">
        <p className="text-center text-5xl font-semibold tracking-tight text-white tabular-nums">3:42</p>
        <p className="mt-1 text-center text-xs text-ink-300">Owner’s phone, on the nightstand</p>
        <div className="mx-auto mt-6 max-w-sm space-y-2.5">
          <Notification time="2:10 AM" title="New job: Dana, water heater burst">
            $149 PayPal hold placed. Marcus confirmed, 35–45 min.
          </Notification>
          <Notification time="now" title="Dana approved the $420 bill">
            $149 captured from the hold. $271 balance sent with Pay Later.
          </Notification>
        </div>
      </div>
      <div className="relative mx-3 -mt-10 rounded-xl bg-white p-4 shadow-xl ring-1 ring-gray-200 sm:mx-8 sm:-mt-12 sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <Icon name="sparkle" className="h-3.5 w-3.5 text-brand-600" /> AI ticket for the tech
        </p>
        <p className="mt-2 text-sm text-gray-800">
          Water heater burst in the garage. The caller closed the valve on the cold pipe above the tank and the water has stopped.
        </p>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-500">Likely work</dt>
          <dd className="text-gray-800">Water heater repair or replacement</dd>
          <dt className="text-gray-500">Safety</dt>
          <dd className="text-gray-800">Water shut off; caller kept away from outlets</dd>
          <dt className="text-gray-500">Language</dt>
          <dd className="text-gray-800">Spanish</dd>
        </dl>
      </div>
    </div>
  );
}

function Notification({ time, title, children }: { time: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-300">
        <span className="flex items-center gap-1.5 font-semibold tracking-wide uppercase">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-brand-500 text-white">
            <Icon name="shield" className="h-2.5 w-2.5" />
          </span>
          Call Captain
        </span>
        <span>{time}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-white">{title}</p>
      <p className="text-[13px] text-ink-300">{children}</p>
    </div>
  );
}
