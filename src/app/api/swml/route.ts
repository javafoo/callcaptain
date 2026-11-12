import { NextResponse } from "next/server";
import { buildSwml, keypadSwml } from "@/lib/agent";
import { createJob, getJob, updateJob, event, type Job } from "@/lib/db";
import { dispatchTechnician } from "@/lib/money";
import { arrivingIn, startTechCall } from "@/lib/tech-call";
import { env, hasWebhookKey, originOf } from "@/lib/env";
import { getBusiness, workspaceForCaller } from "@/lib/settings";
import { DEMO_WS } from "@/lib/workspace-id";

/**
 * SignalWire fetches the call script here when a call starts (SWML webhook resource,
 * https://signalwire.com/docs/swml/guides/remote-server). Browser calls carry our job id
 * in the call's user variables; phone calls get a fresh job in the workspace of whoever
 * registered the caller's number (Go live → Test from your phone), else the demo business.
 */

function findJobId(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if ((k === "jobId" || k === "job_id") && typeof v === "string") return v;
    const nested = findJobId(v, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { call?: { call_id?: string; from?: string }; vars?: { pay_result?: string } };
  const callId = body.call?.call_id ?? null;
  const params = new URL(req.url).searchParams;

  // Phone calls continue here when the AI session ends: take_card_on_keypad stopped it to open the
  // secure keypad (the job is waiting for it), or the conversation is over.
  if (params.get("after_ai") === "1") {
    const job = await getJob(params.get("job") ?? "");
    if (job && job.channel !== "web" && job.pay_step === "starting") {
      return NextResponse.json(keypadSwml(job, await getBusiness(job.business_id), originOf(req), env.webhookSecret));
    }
    return NextResponse.json({ version: "1.0.0", sections: { main: [{ hangup: {} }] } });
  }

  // Back from the secure keypad hand-off: same call, same job, a fresh AI session.
  if (params.get("resume") === "1") {
    const job = await getJob(params.get("job") ?? "");
    if (job) {
      const raw = params.get("pay_result");
      const payResult = body.vars?.pay_result ?? (raw && !raw.includes("$") ? raw : null);
      let back = await updateJob(job.id, { pay_step: null }, event("agent", `Back from the secure keypad (${payResult ?? "no result"})`));
      const b = await getBusiness(back.business_id);
      // Secured on the keypad: dispatch right here rather than trusting the fresh AI session to call
      // dispatch_technician (it once kept saying "one moment" instead). The greeting says what happened.
      let next: string | null = null;
      if (back.status === "hold_placed" || back.status === "card_saved") {
        try {
          back = await dispatchTechnician(back, b);
          const call = await startTechCall(back, b, originOf(req), env.webhookSecret);
          const tech = back.tech_name ?? b.technician;
          if (call.kind === "calling" || call.kind === "already") next = `I'm calling ${tech} now to confirm. Please stay on the line.`;
          else if (call.kind === "failed") {
            back = call.job;
            next = `I couldn't reach ${tech}, so the owner will call you back shortly to get someone out.`;
          } else next = `${tech} is on the way and can be there ${arrivingIn(back.eta ?? b.eta)}.`;
        } catch (e) {
          console.error("[swml] dispatch after keypad", e instanceof Error ? e.message : e);
        }
      }
      return NextResponse.json(buildSwml(back, b, originOf(req), env.webhookSecret, { payResult, next }));
    }
  }

  const jobId = findJobId(body);
  if (process.env.LOG_SWML_BODY) console.log("[swml] body", JSON.stringify(body).slice(0, 4000));

  let job: Job | null = jobId ? await getJob(jobId) : null;
  if (job) {
    job = await updateJob(job.id, { call_id: callId }, event("agent", "Agent answered"));
  } else {
    const workspace = (await workspaceForCaller(body.call?.from)) ?? DEMO_WS;
    const b = await getBusiness(workspace);
    job = await createJob(workspace, "phone", b.serviceCallCents, callId, b.secureWith);
    if (body.call?.from) job = await updateJob(job.id, { callback_phone: body.call.from });
  }

  return NextResponse.json(buildSwml(job, await getBusiness(job.business_id), originOf(req), env.webhookSecret));
}
