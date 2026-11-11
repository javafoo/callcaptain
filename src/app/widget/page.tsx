import { Suspense } from "react";
import { WidgetCall } from "@/components/widget-call";
import { env } from "@/lib/env";
import { getBusiness } from "@/lib/settings";

export const metadata = { title: "Talk to our dispatcher" };

async function Widget() {
  const b = await getBusiness();
  return <WidgetCall paypalClientId={process.env.PAYPAL_CLIENT_ID ?? ""} liveCalls={env.signalwireReady} businessName={b.businessName} agentName={b.agentName} />;
}

/** What /embed.js opens in its iframe on a contractor's website. */
export default function WidgetPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-ink-900" />}>
      <Widget />
    </Suspense>
  );
}
