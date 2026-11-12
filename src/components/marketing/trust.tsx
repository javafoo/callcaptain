import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { Glyph, type GlyphName } from "./icons";
import { Cite, Container, SectionHeading } from "./primitives";

export function Trust() {
  return (
    <section aria-labelledby="trust-title" className="bg-[#f4f6f8] py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="trust-title"
          eyebrow="Trust"
          title="Safe for the caller. Safe for your money."
          lead="Ava does the talking. Code and PayPal decide what happens to money, so a clever caller can’t talk her into sending a truck."
        />

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TrustCard icon="shield" title="No dispatch until PayPal confirms" className="lg:col-span-2">
            <p>
              It’s enforced in code, not left to the AI. The dispatch step refuses to run until PayPal confirms the saved card or the hold, whatever anyone says on the call.
            </p>
            <pre className="mt-4 rounded-lg bg-ink-900 p-4 font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-white sm:text-[12.5px]">
              <span className="text-ink-300">{"// src/lib/money.ts · dispatchTechnician()"}</span>
              {"\n"}
              <span className="text-brand-200">if</span> {"(job.status !== "}
              <span className="text-amber-200">{'"hold_placed"'}</span>
              {" && job.status !== "}
              <span className="text-amber-200">{'"card_saved"'}</span>
              {")\n  "}
              <span className="text-brand-200">throw new</span> {"Error("}
              <span className="text-amber-200">{'"visit not secured"'}</span>
              {");"}
            </pre>
          </TrustCard>

          <TrustCard icon="lock" title="The AI never hears a card number">
            <p>
              Cards go into PayPal’s own form on the caller’s screen, or the keypad on a phone call. If someone starts reading digits out loud, Ava stops them.
            </p>
            <p className="mt-4 rounded-lg bg-brand-50 px-3.5 py-3 text-brand-700 ring-1 ring-brand-200">
              <span className="text-lg font-semibold">77%</span> of consumers prefer not to read card details to a phone agent.
              <Cite source="eckoh" />
            </p>
          </TrustCard>

          <TrustCard icon="flame" title="Gas smell means 911, not a truck">
            <p>Ava tells the caller to leave the house now and call 911 and the gas company. She doesn’t send a technician.</p>
          </TrustCard>

          <TrustCard icon="check" title="Customer approves the bill">
            <p>Marcus enters the bill on his phone. The customer approves it on their own screen, or by QR code, before anything is charged.</p>
          </TrustCard>

          <TrustCard icon="pin" title="Only inside your service area">
            <p>Every caller’s ZIP is checked against your counties in code. Outside your area, Ava says so and asks for no card.</p>
          </TrustCard>
        </div>
      </Container>
    </section>
  );
}

function TrustCard({ icon, title, className, children }: { icon: GlyphName; title: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border border-gray-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-7", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-brand-500">
        <Glyph name={icon} className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-gray-900">{title}</h3>
      <div className="mt-2 text-sm text-gray-600">{children}</div>
    </div>
  );
}
