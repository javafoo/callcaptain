import { NextResponse } from "next/server";
import { buildSwml } from "@/lib/agent";
import { createJob, getJob, updateJob, event, type Job } from "@/lib/db";
import { env, hasWebhookKey, originOf } from "@/lib/env";
import { getBusiness } from "@/lib/settings";

/**
 * SignalWire fetches the call script here when a call starts (SWML webhook resource,
 * https://signalwire.com/docs/swml/guides/remote-server). Browser calls carry our job id
 * in the call's user variables; phone calls get a fresh job.
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
  const b = await getBusiness();

  // Back from the secure keypad hand-off: same call, same job, a fresh AI session.
  if (params.get("resume") === "1") {
    const job = await getJob(params.get("job") ?? "");
    if (job) {
      const raw = params.get("pay_result");
      const payResult = body.vars?.pay_result ?? (raw && !raw.includes("$") ? raw : null);
      const back = await updateJob(job.id, { pay_step: null }, event("agent", `Back from the secure keypad (${payResult ?? "no result"})`));
      return NextResponse.json(buildSwml(back, b, originOf(req), env.webhookSecret, { payResult }));
    }
  }

  const jobId = findJobId(body);
  if (process.env.LOG_SWML_BODY) console.log("[swml] body", JSON.stringify(body).slice(0, 4000));

  let job: Job | null = jobId ? await getJob(jobId) : null;
  if (job) {
    job = await updateJob(job.id, { call_id: callId }, event("agent", "Agent answered"));
  } else {
    job = await createJob("phone", b.serviceCallCents, callId);
    if (body.call?.from) job = await updateJob(job.id, { callback_phone: body.call.from });
  }

  return NextResponse.json(buildSwml(job, b, originOf(req), env.webhookSecret));
}
