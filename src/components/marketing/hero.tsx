import { StatusPill } from "@/components/status-pill";
import { Icon, cx } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { Glyph } from "./icons";
import { ButtonLink, Container } from "./primitives";

const PROMISES = ["Card on file with PayPal on the call, $0 tonight", "No dispatch until PayPal confirms", "Charged only with the customer’s OK"];

export function Hero({ phone }: { phone: string | null }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ink-900 text-white">
      <Backdrop />
      <Container className="grid grid-cols-1 items-center gap-16 pt-14 pb-20 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_500px] lg:gap-10 lg:pt-24 lg:pb-28">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-ink-300 ring-1 ring-white/10 ring-inset">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
            AI after-hours dispatcher for plumbing &amp; HVAC
          </p>
          <h1 id="hero-title" className="mt-6 text-[2.5rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl xl:text-[3.5rem]">
            <span className="block">Answer every 2&nbsp;AM emergency.</span>{" "}
            <span className="block text-brand-500">Never roll a truck for free.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-pretty text-ink-300">
            AI receptionists book appointments. Call Captain answers every after-hours call, keeps the caller safe, and backs every truck roll with a card on file through PayPal, before it leaves.
          </p>
          <ul className="mt-6 flex flex-col gap-2 text-sm text-white/90">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-500">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/call" size="lg">
              <Icon name="phone" className="h-5 w-5" />
              Try a call with Ava
            </ButtonLink>
            <ButtonLink href="/setup" size="lg" variant="dark">
              Set up your business
              <Glyph name="arrowRight" className="h-4 w-4" />
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-ink-300">
            Talk to Ava from your browser. No sign-up.
            {phone && (
              <>
                {" "}
                Or call{" "}
                <a href={`tel:${phone}`} className="font-semibold whitespace-nowrap text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white">
                  {formatPhone(phone)}
                </a>
                .
              </>
            )}
          </p>
        </div>

        <HeroVisual />
      </Container>
    </section>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_70%_0%,black,transparent)]" />
      <div className="absolute -top-48 -right-40 h-[620px] w-[620px] rounded-full bg-brand-500/15 blur-3xl" />
      <div className="absolute -bottom-56 -left-40 h-[480px] w-[480px] rounded-full bg-ink-700/50 blur-3xl" />
    </div>
  );
}

/** The caller's phone at 2:07 AM next to the job card the owner sees, both drawn like the real app. */
function HeroVisual() {
  return (
    <figure className="relative mx-auto w-full max-w-[500px]">
      <figcaption className="sr-only">
        Example: at 2:07 AM a homeowner is on the phone with Ava. Harbor Plumbing &amp; Heating’s job card shows a card saved on file with PayPal, nothing charged, and Marcus
        dispatched, 35 to 45 minutes away.
      </figcaption>
      <div aria-hidden className="relative flex flex-col items-center sm:block sm:h-[560px]">
        <div className="relative sm:absolute sm:top-0 sm:left-0">
          <PhoneMock />
        </div>
        <div className="relative z-10 -mt-24 w-full max-w-[340px] self-end sm:absolute sm:top-[92px] sm:right-0 sm:mt-0 sm:w-[292px]">
          <JobCardMock />
        </div>
      </div>
    </figure>
  );
}

function PhoneMock() {
  return (
    <div className="w-[244px] rounded-[2.6rem] bg-gray-950 p-[9px] shadow-2xl ring-1 shadow-black/50 ring-white/10">
      <div className="relative flex h-[500px] flex-col overflow-hidden rounded-[2.05rem] bg-gradient-to-b from-ink-800 via-ink-900 to-ink-950">
        <div className="absolute top-2 left-1/2 h-[22px] w-[72px] -translate-x-1/2 rounded-full bg-gray-950" />
        <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-semibold text-white/80">
          <span>2:07 AM</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-white/70" /> 5G
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center px-4 pt-9 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
            <Icon name="wrench" className="h-7 w-7 text-white/90" />
          </span>
          <p className="mt-3 text-sm leading-tight font-semibold">Harbor Plumbing &amp; Heating</p>
          <p className="mt-0.5 text-xs text-white/60">After-hours line</p>
          <p className="mt-2 text-xs text-white/80">Ava · 3:12</p>
          <div className="mt-3 flex h-7 items-end gap-1">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-brand-500 motion-safe:animate-pulse"
                style={{ height: `${8 + ((i * 7) % 20)}px`, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>

          <div className="mt-5 flex w-full items-center gap-2 rounded-2xl bg-brand-500/15 p-2.5 text-left text-[12px] leading-snug text-brand-100 ring-1 ring-brand-500/30">
            <Icon name="shield" className="h-[18px] w-[18px] shrink-0 text-brand-500" />
            Card saved with PayPal. Nothing charged.
          </div>
          <div className="mt-2.5 w-full rounded-2xl bg-white/[0.06] p-3 text-left text-[12px] leading-snug text-white/90 ring-1 ring-white/10">
            <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-brand-200 uppercase">Ava</span>
            You’re all set. Marcus just confirmed. He’ll be there in 35 to 45 minutes.
          </div>
        </div>

        <div className="flex justify-center pt-3 pb-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
            <Icon name="phone" className="h-6 w-6 rotate-[135deg]" />
          </span>
        </div>
      </div>
    </div>
  );
}

const STEPS = ["Answered", "Triage", "Card on file", "Dispatched"];

function JobCardMock() {
  return (
    <div className="overflow-hidden rounded-xl bg-white text-gray-900 shadow-2xl ring-1 shadow-black/40 ring-black/5">
      <div className="flex items-center justify-between gap-2 bg-gray-50 px-4 py-2 text-[11px] font-medium text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          Live · Harbor Plumbing &amp; Heating
        </span>
        <span>Jobs</span>
      </div>
      <div className="flex items-start justify-between gap-3 border-t border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-gray-500">Job #7F3A · emergency</p>
          <p className="mt-0.5 text-base font-semibold">Dana</p>
        </div>
        <StatusPill status="dispatched" />
      </div>

      <ol className="grid grid-cols-4 border-b border-gray-100 px-1 py-3">
        {STEPS.map((s) => (
          <li key={s} className="flex flex-col items-center gap-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
              <Icon name="check" className="h-3.5 w-3.5" />
            </span>
            <span className="text-[10px] font-medium whitespace-nowrap text-gray-700">{s}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-2 px-4 py-3 text-[13px] text-gray-800">
        <p className="flex gap-2">
          <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          214 Alder Lane, San Jose 95125
        </p>
        <p className="flex gap-2">
          <Icon name="wrench" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          Water heater burst, water in the garage
        </p>
      </div>

      <div className="space-y-2 px-4">
        <MockRow tone="brand" icon="shield" title="Card on file · Visa •••• 1111 · PayPal" note="$0 tonight. Charged only after they approve." />
        <MockRow tone="blue" icon="truck" title="Marcus dispatched · 35–45 min" note="Accepted by voice at 2:10 AM" />
      </div>

      <div className="mt-3 border-t border-gray-100 px-4 py-3">
        <div className="flex flex-col gap-1.5 text-[12px]">
          <span className="text-[10px] text-gray-500">Ava</span>
          <p className="max-w-[88%] self-start rounded-2xl rounded-bl-md bg-gray-100 px-3 py-1.5 text-gray-800">Marcus just confirmed. He’s on his way.</p>
          <p className="max-w-[88%] self-end rounded-2xl rounded-br-md bg-ink-800 px-3 py-1.5 text-white">Thank you. The water’s off.</p>
        </div>
      </div>
    </div>
  );
}

function MockRow({ tone, icon, title, note }: { tone: "brand" | "blue"; icon: "shield" | "truck"; title: string; note: string }) {
  return (
    <div className={cx("flex items-start gap-2.5 rounded-lg p-2.5 ring-1", tone === "brand" ? "bg-brand-50 ring-brand-200" : "bg-blue-50 ring-blue-200")}>
      <Icon name={icon} className={cx("mt-0.5 h-4 w-4 shrink-0", tone === "brand" ? "text-brand-600" : "text-blue-600")} />
      <div className="min-w-0">
        <p className={cx("text-[13px] font-semibold", tone === "brand" ? "text-brand-700" : "text-blue-700")}>{title}</p>
        <p className="text-[12px] text-gray-600">{note}</p>
      </div>
    </div>
  );
}
