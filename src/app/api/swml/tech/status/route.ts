import { NextResponse } from "next/server";
import { findJobByTechCall, getJob } from "@/lib/db";
import { hasWebhookKey } from "@/lib/env";
import { getBusiness } from "@/lib/settings";
import { techCallState, techDetect } from "@/lib/tech-call";

/**
 * Callbacks for the agent's call to the technician:
 *  - the dial's status_url: `calling.call.state` with call_state ringing | answered | ended, and
 *    end_reason (busy, noAnswer, decline, ...) once it ends
 *    (https://signalwire.com/docs/apis/rest/webhooks/call-state-status-callback)
 *  - detect_machine's status_url: `calling.call.detect` with HUMAN | MACHINE | UNKNOWN
 *    (https://signalwire.com/docs/swml/reference/calling/detect-machine)
 * A call that ends without accept_job or decline_job counts as no answer.
 */

type Callback = {
  event_type?: string;
  params?: {
    call_id?: string;
    call_state?: string;
    end_reason?: string;
    detect?: { type?: string; params?: { event?: string } };
  };
};

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Callback;
  const p = body.params ?? {};
  const callId = p.call_id ?? null;

  let job = await getJob(new URL(req.url).searchParams.get("job") ?? "");
  if (!job && callId) job = await findJobByTechCall(callId);
  if (!job) return NextResponse.json({ ok: true });
  // Only this job's technician call moves it.
  if (callId && job.tech_call_id && job.tech_call_id !== callId) return NextResponse.json({ ok: true });

  const b = await getBusiness(job.business_id);
  if (body.event_type === "calling.call.state") await techCallState(job, b, callId, p.call_state, p.end_reason);
  else if (body.event_type === "calling.call.detect") await techDetect(job, b, callId, p.detect?.type, p.detect?.params?.event);
  else console.warn("[tech-status]", body.event_type ?? "unknown event", JSON.stringify(body).slice(0, 400));
  return NextResponse.json({ ok: true });
}
