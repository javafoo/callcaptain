import { after, NextResponse } from "next/server";
import { handlePayPalEvent, parseWebhookEvent, verifyWebhook } from "@/lib/paypal-webhooks";

/** The work after the response waits a few seconds for the browser, then calls PayPal. */
export const maxDuration = 60;

/**
 * PayPal webhooks (registered with scripts/register-paypal-webhook.mjs). Nothing happens until
 * PayPal confirms it sent the event; then PayPal gets its 200 right away and the job, ledger and
 * alerts are brought up to date after the response (src/lib/paypal-webhooks.ts).
 */
export async function POST(req: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ error: "PayPal webhooks aren't set up here (PAYPAL_WEBHOOK_ID)." }, { status: 503 });

  const raw = await req.text();
  const event = parseWebhookEvent(raw);
  if (!event) return NextResponse.json({ error: "Not a PayPal webhook event." }, { status: 400 });

  const verdict = await verifyWebhook(req.headers, raw, webhookId);
  if (verdict === "unavailable") return NextResponse.json({ error: "Couldn't reach PayPal to verify the event." }, { status: 502 });
  if (verdict === "rejected") return NextResponse.json({ error: "PayPal didn't verify this event." }, { status: 400 });

  after(async () => {
    try {
      console.log(`[paypal webhook] ${event.event_type} ${event.id}: ${await handlePayPalEvent(event)}`);
    } catch (e) {
      console.error(`[paypal webhook] ${event.event_type} ${event.id} failed:`, e instanceof Error ? e.message : e);
    }
  });
  return NextResponse.json({ received: true });
}
