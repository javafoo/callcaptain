import { Suspense } from "react";
import { CallDemo } from "@/components/call-demo";
import { Card, Icon, PageHeader } from "@/components/ui";
import { env } from "@/lib/env";
import { dollars } from "@/lib/format";
import { getBusiness } from "@/lib/settings";

async function LiveCall() {
  const b = await getBusiness();
  return (
    <>
      <CallDemo
        paypalClientId={process.env.PAYPAL_CLIENT_ID ?? ""}
        liveCalls={env.signalwireReady}
        business={{ name: b.businessName, agentName: b.agentName, technician: b.technician, tripFeeCents: b.tripFeeCents, secureWith: b.secureWith }}
      />
      <MoneyFlows fee={dollars(b.serviceCallCents)} tripFee={dollars(b.tripFeeCents)} agent={b.agentName} />
    </>
  );
}

function MoneyFlows({ fee, tripFee, agent }: { fee: string; tripFee: string; agent: string }) {
  const flows = [
    { icon: "shield" as const, title: "Hold on the call", body: `${agent} puts a PayPal button on the caller's screen for the ${fee} service call. PayPal, Venmo or card. $0 moves.`, api: "Orders v2 · AUTHORIZE" },
    { icon: "keypad" as const, title: "Or the keypad, not the AI", body: "Callers can type a card on the keypad instead. SignalWire collects the digits, PayPal holds the card, and the AI never hears a number.", api: "SWML pay → Orders v2 card" },
    { icon: "dollar" as const, title: "Charge after the job", body: "The owner enters the final bill. PayPal captures it from the hold and releases the rest, or sends the balance with Pay Later.", api: "Capture · Pay Later" },
    { icon: "clock" as const, title: "Fair cancellations", body: `Cancel before dispatch: the hold is voided. Cancel after the truck rolls: only the ${tripFee} trip fee is kept.`, api: "Void · partial capture" },
  ];
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-gray-900">Every money moment runs through PayPal</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {flows.map((f) => (
          <Card key={f.title} className="flex flex-col p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon name={f.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-gray-900">{f.title}</h3>
            <p className="mt-1 flex-1 text-sm text-gray-500">{f.body}</p>
            <p className="mt-3 font-mono text-[11px] text-gray-400">{f.api}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <PageHeader
        title="Live call"
        description="Your after-hours line, answered by AI. Call it from your browser, play a homeowner with an emergency, and watch the job and the PayPal hold fill in."
      />
      <Suspense fallback={<div className="h-[680px] animate-pulse rounded-xl bg-gray-200/60" />}>
        <LiveCall />
      </Suspense>
    </>
  );
}
