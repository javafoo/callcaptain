import { Glyph, type GlyphName } from "./icons";
import { ApiTag, Container, SectionHeading } from "./primitives";

const HOLD = 149;

/** The same $149 hold, settled four ways. Amounts match the demo in the README. */
const ENDINGS: { title: string; captured: number; balance?: string; result: string; api: string }[] = [
  { title: "Bill comes in at $120", captured: 120, result: "$120 captured · $29 released", api: "capture" },
  { title: "Bill comes in at $1,840", captured: 149, balance: "+ $1,691", result: "$149 captured · $1,691 balance with Pay Later", api: "capture + balance order" },
  { title: "Cancelled after the truck rolls", captured: 79, result: "$79 trip fee kept · $70 released", api: "partial capture" },
  { title: "Cancelled before dispatch", captured: 0, result: "Hold voided · $0 charged", api: "void" },
];

const STAGES: { title: string; moments: { icon: GlyphName; title: string; body: string; api: string }[] }[] = [
  {
    title: "Before the truck rolls",
    moments: [
      {
        icon: "shield",
        title: "Hold on the call",
        body: "A PayPal button appears on the caller’s screen mid-call. They approve with PayPal, Venmo or a card. $0 moves.",
        api: "Orders v2 · AUTHORIZE · JS SDK v6",
      },
      {
        icon: "card",
        title: "Or card on file, $0 tonight",
        body: "If you prefer, the caller saves PayPal or a card with PayPal Vault instead. Nothing is charged or held.",
        api: "Vault v3 · setup token → payment token",
      },
      {
        icon: "keypad",
        title: "Keypad on a phone call",
        body: "No screen? The caller types the card on the keypad and PayPal holds it. The AI never hears a digit.",
        api: "Orders v2 · card · AUTHORIZE",
      },
    ],
  },
  {
    title: "After the job",
    moments: [
      {
        icon: "dollar",
        title: "Capture what was approved",
        body: "The customer approves the final bill. PayPal captures it from the hold and releases the rest.",
        api: "Authorizations · capture",
      },
      {
        icon: "receipt",
        title: "Bigger bill, Pay Later",
        body: "PayPal captures the whole hold. The customer pays the balance with PayPal, Venmo or Pay Later.",
        api: "Orders v2 · CAPTURE · Pay Later",
      },
      {
        icon: "card",
        title: "Charge the card on file",
        body: "A saved card or PayPal account is charged once, only after the customer approves the amount.",
        api: "Orders v2 · CAPTURE · vault_id",
      },
    ],
  },
  {
    title: "If plans change",
    moments: [
      {
        icon: "clock",
        title: "Cancel before dispatch",
        body: "The hold is voided and nothing is charged. A saved card is removed.",
        api: "Authorizations · void",
      },
      {
        icon: "truck",
        title: "Cancel after the truck rolls",
        body: "Only the $79 trip fee is kept. The rest of the hold is released.",
        api: "Partial capture · final_capture",
      },
      {
        icon: "refund",
        title: "Refunds from your ledger",
        body: "Every hold, capture and release lands in a PayPal payments ledger. Refund from the dashboard.",
        api: "Captures · refund · webhooks",
      },
    ],
  },
];

export function MoneyMoments() {
  return (
    <section id="paypal" aria-labelledby="paypal-title" className="relative isolate scroll-mt-16 overflow-hidden bg-ink-900 py-20 text-white sm:py-28">
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      <Container>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-center">
          <SectionHeading
            id="paypal-title"
            dark
            eyebrow="PayPal"
            title="Every money moment runs through PayPal"
            lead="Ava handles the conversation. PayPal handles the money. Every hold, capture, release, balance and refund is a PayPal API call, made in code at the moment the job calls for it, never on the AI’s say-so."
          />
          <Endings />
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-6">
          {STAGES.map((stage) => (
            <div key={stage.title}>
              <h3 className="flex items-center gap-3 text-sm font-semibold text-white">
                {stage.title}
                <span className="h-px flex-1 bg-white/10" aria-hidden />
              </h3>
              <ul role="list" className="mt-4 space-y-3">
                {stage.moments.map((m) => (
                  <li key={m.title} className="flex gap-4 rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-500">
                      <Glyph name={m.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white">{m.title}</h4>
                      <p className="mt-1 text-sm text-ink-300">{m.body}</p>
                      <div className="mt-2">
                        <ApiTag dark>{m.api}</ApiTag>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 rounded-xl bg-white/[0.04] px-5 py-4 text-sm ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-white">PayPal Orders v2 · Vault v3 · JS SDK v6 · Refunds · Webhooks</p>
          <p className="text-ink-300">Every PayPal write sends a PayPal-Request-Id, so a retried webhook can’t charge twice.</p>
        </div>
      </Container>
    </section>
  );
}

function Endings() {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-white">One $149 hold, four endings</h3>
        <p className="flex items-center gap-3 text-xs text-ink-300">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden /> captured
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/25" aria-hidden /> released
          </span>
        </p>
      </div>
      <ul role="list" className="mt-5 space-y-5">
        {ENDINGS.map((e) => (
          <li key={e.title}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium text-white">{e.title}</p>
              <p className="shrink-0 font-mono text-[11px] text-ink-300">{e.api}</p>
            </div>
            <div className="mt-2 flex items-center gap-2" aria-hidden>
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                <span className="h-full rounded-full bg-brand-500" style={{ width: `${(e.captured / HOLD) * 100}%` }} />
              </div>
              {e.balance && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200 tabular-nums">{e.balance}</span>}
            </div>
            <p className="mt-1.5 text-xs text-ink-300">{e.result}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
