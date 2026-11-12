import { Icon } from "@/components/ui";
import { ButtonLink, Container, SectionHeading } from "./primitives";

const INCLUDED = ["No setup fee", "Unlimited after-hours calls during the beta", "Card on file, PayPal holds, jobs dashboard and phone alerts"];

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="relative isolate scroll-mt-16 overflow-hidden bg-ink-900 py-20 text-white sm:py-28">
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 -z-10 h-[520px] w-[520px] rounded-full bg-brand-500/15 blur-3xl" />
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            id="pricing-title"
            dark
            eyebrow="Pricing"
            title="Free during beta"
            lead="Put Ava on your after-hours line at no cost while Call Captain is in beta. You keep what you collect, minus PayPal’s standard processing fees."
          />
          <p className="mt-8 max-w-xl text-lg font-medium text-white">Your next 2 AM call is coming. Let Ava take it.</p>
        </div>

        <div className="rounded-2xl bg-white p-6 text-gray-900 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">Call Captain</p>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset">Beta</span>
          </div>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight tabular-nums">$0</span>
            <span className="text-sm text-gray-500">while in beta</span>
          </p>
          <ul role="list" className="mt-6 space-y-3 text-sm text-gray-700">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                {item}
              </li>
            ))}
            <li className="flex gap-3 text-gray-600">
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Icon name="dollar" className="h-3.5 w-3.5" />
              </span>
              Standard PayPal processing fees apply
            </li>
          </ul>
          <ButtonLink href="/setup" size="lg" className="mt-8 w-full">
            Set up your business
          </ButtonLink>
          <ButtonLink href="/call" size="lg" variant="light" className="mt-3 w-full">
            <Icon name="phone" className="h-5 w-5 text-gray-500" />
            Try a call with Ava first
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
