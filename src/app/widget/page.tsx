import { Suspense } from "react";
import { WidgetCall } from "@/components/widget-call";
import { env } from "@/lib/env";
import { getBusiness } from "@/lib/settings";
import { DEMO_WS, isWorkspaceId } from "@/lib/workspace-id";

export const metadata = { title: { absolute: "Talk to our dispatcher" } };

async function Widget({ searchParams }: { searchParams: PageProps<"/widget">["searchParams"] }) {
  const { b: param } = await searchParams;
  const businessId = isWorkspaceId(param) ? param : DEMO_WS;
  const b = await getBusiness(businessId);
  return (
    <WidgetCall
      paypalClientId={process.env.PAYPAL_CLIENT_ID ?? ""}
      liveCalls={env.signalwireReady}
      businessId={businessId}
      businessName={b.businessName}
      agentName={b.agentName}
    />
  );
}

/** What /embed.js opens in its iframe on a contractor's website (?b= is the business from the snippet). */
export default function WidgetPage({ searchParams }: PageProps<"/widget">) {
  return (
    <Suspense fallback={<div className="h-screen bg-ink-900" />}>
      <Widget searchParams={searchParams} />
    </Suspense>
  );
}
