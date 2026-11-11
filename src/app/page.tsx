import { CallDemo } from "@/components/call-demo";
import { BUSINESS } from "@/lib/business";
import { env } from "@/lib/env";
import { dollars } from "@/lib/format";

const MONEY_STEPS = [
  {
    title: "Hold on the call",
    body: `Ava puts a PayPal button on the caller's screen for the ${dollars(BUSINESS.serviceCallCents)} service call. PayPal, Venmo or card. It's an authorization, so $0 moves.`,
    api: "Orders v2 · intent AUTHORIZE",
  },
  {
    title: "Or the keypad, not the AI",
    body: "Callers who'd rather not tap a link type a card on the keypad. SignalWire collects the digits, PayPal holds the card, and the AI never hears a number.",
    api: "SWML pay → Orders v2 card",
  },
  {
    title: "Charge after the job",
    body: "The tech finishes and quotes. The owner enters the final bill; PayPal captures it from the hold and releases the rest.",
    api: "Authorizations · capture",
  },
  {
    title: "Release or split",
    body: `Cancel before dispatch and the hold is voided. Cancel after, and only the ${dollars(BUSINESS.tripFeeCents)} trip fee is kept. Big repair? The balance goes out as a PayPal link with Pay Later.`,
    api: "void · partial capture · Pay Later",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <section className="grid gap-6 py-10 sm:py-14 lg:grid-cols-[3fr_2fr] lg:items-end">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 ring-1 ring-blue-200">
            AI voice agent · PayPal holds · built for plumbing &amp; HVAC
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">The 2 AM emergency call, answered and paid for.</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Ava is an AI dispatcher for home service companies. She keeps the caller safe, books the truck, and secures the service call with a PayPal hold that is charged only after the work is done.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          <p className="font-semibold text-slate-900">Why a hold, not a payment?</p>
          <p className="mt-1">
            Homeowners pay after the job, and they don&apos;t read card numbers to a stranger at night. Contractors can&apos;t send a truck at 2 AM to a no-show. A PayPal hold solves both: the customer pays through a brand they trust, and the business knows the visit is covered.
          </p>
        </div>
      </section>

      <CallDemo paypalClientId={process.env.PAYPAL_CLIENT_ID ?? ""} liveCalls={env.signalwireReady} />

      <section className="mt-16">
        <h2 className="text-2xl font-semibold text-slate-950">Every money moment, handled by the agent</h2>
        <p className="mt-1 text-slate-600">Four PayPal flows, one job record, nobody typing card numbers into a CRM.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MONEY_STEPS.map((s) => (
            <div key={s.title} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm text-slate-600">{s.body}</p>
              <p className="mt-4 font-mono text-xs text-blue-700">{s.api}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
