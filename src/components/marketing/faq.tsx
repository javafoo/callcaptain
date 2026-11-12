import Link from "next/link";
import { Glyph } from "./icons";
import { Container, SectionHeading } from "./primitives";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is the customer charged on the call?",
    a: "No. Ava asks to keep a card on file with PayPal, and $0 moves. The saved card is charged only after the job, once the customer approves the final bill on their own phone. Owners who want money held up front can switch to a $149 PayPal hold instead.",
  },
  {
    q: "What if the bill is big?",
    a: "The customer approves the amount first, then the saved card or PayPal account is charged. With the hold option, PayPal captures the hold and the customer pays the balance with PayPal, Venmo or, on eligible amounts, Pay Later.",
  },
  {
    q: "What if they cancel?",
    a: "Cancel before the technician heads out and nothing is charged. Cancel after the truck rolls and only the $79 trip fee is charged, and it goes toward the bill. You set the amount.",
  },
  {
    q: "What if the caller won’t leave a card?",
    a: "Ava doesn’t push. She books the first morning visit instead, with nothing up front. Nobody is turned away.",
  },
  {
    q: "Do I need new phones?",
    a: "No. Forward your after-hours line to Ava’s phone number, and callers keep dialing the number they already know. You can also add a “Talk to us now” button to your website with one line of code.",
  },
  {
    q: "What does Ava do if someone smells gas?",
    a: "She tells them to leave the house now and call 911 and the gas company, and she doesn’t send a technician.",
  },
  {
    q: "Is this real money?",
    a: "Not in this build. Call Captain runs on PayPal’s sandbox for the PayPal AI Hackathon, so no real money moves. Try a call and save a sandbox test card.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 bg-white py-20 sm:py-28">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <SectionHeading
          id="faq-title"
          eyebrow="FAQ"
          title="Questions owners ask"
          lead={
            <>
              Rather hear it?{" "}
              <Link href="/call" className="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-700">
                Try a call with Ava
              </Link>
              .
            </>
          }
        />
        <div className="divide-y divide-gray-200 border-y border-gray-200">
          {FAQS.map((f, i) => (
            <details key={f.q} className="group" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-lg py-5 text-left text-base font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition group-open:rotate-180">
                  <Glyph name="chevronDown" className="h-4 w-4" />
                </span>
              </summary>
              <p className="-mt-1 pr-10 pb-5 text-pretty text-gray-600">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
