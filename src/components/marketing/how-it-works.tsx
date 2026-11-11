import type { ReactNode } from "react";
import { Icon, cx } from "@/components/ui";
import { Glyph, type GlyphName } from "./icons";
import { Container, SectionHeading } from "./primitives";

const STEPS: { time: string; title: string; body: ReactNode; visual: ReactNode }[] = [
  {
    time: "2:07 AM",
    title: "Ava answers and puts safety first",
    body: (
      <>
        In a natural voice, in the caller’s language. She walks them to the water shutoff and keeps them away from water near outlets. If they smell gas, she tells them to
        leave the house and call 911, and no truck is sent.
      </>
    ),
    visual: (
      <Panel>
        <Bubble from="Ava">Let’s stop the water first. There’s a valve on the cold pipe above the tank. Turn it until it stops.</Bubble>
        <Bubble from="Caller">Okay. It stopped.</Bubble>
        <Chip tone="red" icon="flame">
          Smells gas? Leave the house, call 911. No dispatch.
        </Chip>
      </Panel>
    ),
  },
  {
    time: "2:08 AM",
    title: "She takes the job and checks your area",
    body: (
      <>
        Name, address with ZIP and what’s wrong, one question at a time. The ZIP is checked against your service counties in code, before any hold is offered. Outside your
        area, she says so kindly and no hold is placed.
      </>
    ),
    visual: (
      <Panel>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg bg-white p-3.5 text-[13px] ring-1 ring-gray-200">
          <dt className="text-gray-500">Name</dt>
          <dd className="text-gray-900">Dana</dd>
          <dt className="text-gray-500">Address</dt>
          <dd className="text-gray-900">214 Alder Lane, San Jose 95125</dd>
          <dt className="text-gray-500">Problem</dt>
          <dd className="text-gray-900">Water heater burst, water in the garage</dd>
        </dl>
        <Chip tone="green" icon="pin">
          95125 · Santa Clara County · in your service area
        </Chip>
      </Panel>
    ),
  },
  {
    time: "2:09 AM",
    title: "She secures the visit with PayPal",
    body: (
      <>
        Ava explains the $149 after-hours service call, credited to the repair. The caller approves a PayPal hold with PayPal, Venmo or a card on their own screen, and $0 moves.
        If you choose card on file instead, they save PayPal or a card with PayPal Vault and nothing is charged that night. On a regular phone call, they type the card
        on the keypad.
      </>
    ),
    visual: (
      <Panel>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-gray-900">Approve the $149 hold</p>
          <p className="text-sm text-gray-600">Nothing is charged now. You pay after the work is done.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] font-semibold">
            <span className="rounded-full bg-white py-2 text-center text-gray-900 ring-1 ring-gray-300">PayPal</span>
            <span className="rounded-full bg-white py-2 text-center text-gray-900 ring-1 ring-gray-300">Venmo</span>
            <span className="col-span-2 rounded-full bg-gray-900 py-2 text-center text-white">Debit or Credit Card</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tag icon="card">Card on file · $0 tonight</Tag>
          <Tag icon="keypad">Phone call · keypad</Tag>
        </div>
      </Panel>
    ),
  },
  {
    time: "2:10 AM",
    title: "PayPal confirms. Marcus rolls.",
    body: (
      <>
        The moment PayPal approves, Ava says “You’re all set” without being asked and dispatches. She phones your on-call technician, briefs him, and he accepts by voice. The
        homeowner hears “Marcus just confirmed” before they hang up.
      </>
    ),
    visual: (
      <Panel>
        <p className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <Icon name="phone" className="h-3.5 w-3.5 text-brand-700" />
          Ava is calling Marcus, on call tonight
        </p>
        <Bubble from="Ava">Burst water heater at 214 Alder Lane. Water’s off and the $149 hold is placed. Can you take it?</Bubble>
        <Bubble from="Marcus">Yep. Heading out now.</Bubble>
        <Chip tone="blue" icon="truck">
          Dana hears: “Marcus just confirmed. 35 to 45 minutes.”
        </Chip>
      </Panel>
    ),
  },
  {
    time: "3:42 AM",
    title: "The customer approves the final bill",
    body: (
      <>
        Marcus enters the bill on his phone. The customer approves it on their own screen, or by scanning a QR code. PayPal captures it from the hold and releases the rest. A
        bigger bill? The balance goes to PayPal, Venmo or Pay Later.
      </>
    ),
    visual: (
      <Panel>
        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">Final bill · Harbor Plumbing &amp; Heating</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">$420.00</p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50 text-gray-700 ring-1 ring-gray-200">
              <Glyph name="qr" className="h-7 w-7" />
            </span>
          </div>
          <span className="mt-3 block rounded-lg bg-brand-700 py-2 text-center text-sm font-semibold text-white">Approve $420.00</span>
        </div>
        <ul className="space-y-1.5 text-[13px] text-gray-700">
          <li className="flex items-center justify-between gap-3">
            <span>Captured from the hold</span>
            <span className="font-medium text-gray-900 tabular-nums">$149.00</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Balance · PayPal, Venmo or Pay Later</span>
            <span className="font-medium text-gray-900 tabular-nums">$271.00</span>
          </li>
        </ul>
      </Panel>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 bg-[#f4f6f8] py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="One call, from the first ring to the final bill"
          lead="A night at Harbor Plumbing & Heating, an example shop running Call Captain."
        />
        <ol className="mt-14 space-y-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="grid grid-cols-1 gap-6 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-gray-200 sm:p-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-12"
            >
              {/* Phones: number and time on one row, text full width. Wider: number in its own column. */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 sm:items-start sm:gap-x-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-white sm:row-span-3 sm:h-10 sm:w-10">
                  {i + 1}
                </span>
                <p className="font-mono text-xs font-medium text-brand-700">{s.time}</p>
                <h3 className="col-span-2 mt-3 text-xl font-semibold tracking-tight text-gray-900 sm:col-span-1 sm:col-start-2 sm:mt-1">{s.title}</h3>
                <p className="col-span-2 mt-2 text-pretty text-gray-600 sm:col-span-1 sm:col-start-2">{s.body}</p>
              </div>
              <div aria-hidden>{s.visual}</div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">{children}</div>;
}

function Bubble({ from, children }: { from: "Ava" | "Caller" | "Marcus"; children: ReactNode }) {
  const mine = from !== "Ava";
  return (
    <div className={cx("flex max-w-[88%] flex-col", mine ? "items-end self-end" : "self-start")}>
      <span className="mb-0.5 text-[11px] text-gray-500">{from}</span>
      <p className={cx("rounded-2xl px-3.5 py-2 text-[13px]", mine ? "rounded-br-md bg-ink-800 text-white" : "rounded-bl-md bg-white text-gray-800 ring-1 ring-gray-200")}>
        {children}
      </p>
    </div>
  );
}

const CHIP = {
  red: "bg-rose-50 text-rose-800 ring-rose-200",
  green: "bg-brand-50 text-brand-700 ring-brand-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
};

function Chip({ tone, icon, children }: { tone: keyof typeof CHIP; icon: GlyphName; children: ReactNode }) {
  return (
    <p className={cx("flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] font-medium ring-1", CHIP[tone])}>
      <Glyph name={icon} className="mt-px h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}

function Tag({ icon, children }: { icon: GlyphName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
      <Glyph name={icon} className="h-3.5 w-3.5 text-gray-500" />
      {children}
    </span>
  );
}
