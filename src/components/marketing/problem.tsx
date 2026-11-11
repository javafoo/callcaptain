import type { ReactNode } from "react";
import { Cite, Container } from "./primitives";
import type { SourceKey } from "./sources";

const STATS: { value: ReactNode; label: ReactNode; source: SourceKey }[] = [
  {
    value: (
      <>
        <span className="text-xl text-gray-500 sm:text-2xl">About </span>1 in 8
      </>
    ),
    label: "calls to trades businesses arrives outside business hours.",
    source: "servicetitan",
  },
  { value: "52%", label: "of inbound home-services calls reach a person.", source: "invoca" },
  { value: "82%", label: "of consumers say they’d call a competitor after an unanswered call.", source: "callrail" },
  { value: "$377", label: "is the average emergency plumbing visit. After-hours trip fees run $100–$350.", source: "fixr" },
];

export function Problem() {
  return (
    <section aria-labelledby="problem-title" className="bg-white py-20 sm:py-28">
      <Container>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-brand-700">The problem</p>
            <h2 id="problem-title" className="mt-2 text-3xl font-semibold tracking-tight text-balance text-gray-900 sm:text-4xl">
              It’s 2:07 AM. A water heater just burst.
            </h2>
            <div className="mt-6 space-y-4 text-lg text-pretty text-gray-600">
              <p>Water is spreading across a garage floor. The homeowner calls the first plumber they find, gets voicemail, and dials the next one.</p>
              <p>
                When someone does pick up, the owner faces a bad choice: wake a technician and send a truck to a stranger who might cancel, not be home or not pay, or let the job go
                to whoever answers next.
              </p>
              <p className="font-medium text-gray-900">
                Call Captain answers, gets the water shut off, and secures the visit with PayPal before Marcus starts the truck.
              </p>
            </div>
          </div>

          <ul role="list" className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
            {STATS.map((s) => (
              <li key={s.source} className="rounded-xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
                <p className="text-3xl font-semibold tracking-tight text-gray-900 tabular-nums sm:text-4xl">{s.value}</p>
                <p className="mt-2 text-sm text-gray-600">
                  {s.label}
                  <Cite source={s.source} />
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16 overflow-hidden rounded-2xl bg-ink-900 text-white">
          <div className="grid grid-cols-1 gap-px bg-white/10 lg:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)]">
            <div className="bg-ink-900 p-8">
              <p className="text-sm font-semibold text-brand-500">Small shops feel it most</p>
              <p className="mt-3 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
                Most plumbing and HVAC companies are small, and small shops book fewer of their calls. Ava gives them a dispatcher who never sleeps.
              </p>
            </div>
            <div className="bg-ink-900 p-8">
              <p className="text-4xl font-semibold tracking-tight tabular-nums">78.3%</p>
              <p className="mt-2 text-sm text-ink-300">
                of the 107,004 US plumbing and HVAC companies with employees have fewer than 10 employees.
                <Cite source="census" />
              </p>
            </div>
            <div className="bg-ink-900 p-8">
              <p className="text-4xl font-semibold tracking-tight tabular-nums">
                30% <span className="text-2xl text-ink-300">vs</span> 58%
              </p>
              <p className="mt-2 text-sm text-ink-300">
                Shops with 10 or fewer technicians book 30% of their calls. Shops with more than 50 book 58%.
                <Cite source="servicetitan" />
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
