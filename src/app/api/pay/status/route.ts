import { NextResponse } from "next/server";
import { event, getJob, updateJob } from "@/lib/db";
import { hasWebhookKey } from "@/lib/env";

/**
 * SWML `pay` status_url (https://signalwire.com/docs/swml/reference/calling/pay): one POST per
 * step of the secure keypad. The call page uses it to unlock its keypad only while SignalWire
 * (not the AI) is collecting digits, and to say which field it wants next. Card fields in the
 * body are ignored and never stored.
 */
type StatusBody = { params?: { for?: string; error_type?: string } };

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as StatusBody;
  const step = body.params?.for ?? null;
  const job = await getJob(new URL(req.url).searchParams.get("job") ?? "");
  if (job && step && job.pay_step !== "done") {
    const error = body.params?.error_type;
    await updateJob(job.id, { pay_step: step }, ...(error ? [event("keypad", `Keypad: ${error.replace(/-/g, " ")}`)] : []));
  }
  return NextResponse.json({ ok: true });
}
