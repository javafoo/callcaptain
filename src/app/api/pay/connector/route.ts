import { NextResponse } from "next/server";
import { event, getJob, updateJob } from "@/lib/db";
import { hasWebhookKey } from "@/lib/env";
import { holdKeypadCard } from "@/lib/money";
import { PayPalError } from "@/lib/paypal";
import { getBusiness } from "@/lib/settings";

/**
 * SignalWire `pay` connector (https://signalwire.com/docs/swml/reference/calling/pay,
 * "payment_connector_url"). SignalWire collects the card on the caller's keypad, so the AI
 * never hears it, and POSTs it here. We place the hold through PayPal and answer in the
 * shape SignalWire expects: 200 { charge_id, error_code: null, error_message: null } on
 * success, non-200 with an error otherwise. Card data is never stored or logged.
 */

type ConnectorBody = {
  transaction_id?: string;
  cardnumber?: string;
  cvv?: string;
  expiry_month?: string;
  expiry_year?: string;
  postal_code?: string;
};

const fail = (status: number, code: string, message: string) => NextResponse.json({ charge_id: null, error_code: code, error_message: message }, { status });

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return fail(403, "forbidden", "Not allowed");
  const job = await getJob(new URL(req.url).searchParams.get("job") ?? "");
  if (!job) return fail(404, "job_not_found", "Unknown job");

  const body = (await req.json().catch(() => ({}))) as ConnectorBody;
  const number = (body.cardnumber ?? "").replace(/\D/g, "");
  if (number.length < 12 || !body.expiry_month || !body.expiry_year) return fail(400, "invalid_card", "Card details are incomplete");

  try {
    const { authorizationId } = await holdKeypadCard(job, await getBusiness(job.business_id), {
      number,
      expiryMonth: body.expiry_month,
      expiryYear: body.expiry_year,
      cvv: body.cvv?.replace(/\D/g, "") || undefined,
      postalCode: body.postal_code?.trim() || undefined,
    });
    return NextResponse.json({ charge_id: authorizationId, error_code: null, error_message: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Card was declined";
    const code = e instanceof PayPalError ? (e.issue ?? "declined").toLowerCase() : "processor_error";
    await updateJob(job.id, {}, event("declined", `Keypad card not held: ${message}`)).catch(() => {});
    return fail(402, code, message);
  }
}
