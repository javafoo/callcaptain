import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { env, hasWebhookKey, originOf } from "@/lib/env";
import { getBusiness } from "@/lib/settings";
import { buildTechSwml, techHeard } from "@/lib/tech-call";

/**
 * The script for the agent's call to the on-call technician. SignalWire fetches it when the
 * outbound call connects (dial `url`, https://signalwire.com/docs/swml/reference/calling) with
 * { call: { call_id, ... } }. Built at that moment, so a visit cancelled while the phone rang
 * gets a short "never mind" instead of a brief.
 */
export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { call?: { call_id?: string } };
  const job = await getJob(new URL(req.url).searchParams.get("job") ?? "");
  if (!job) return NextResponse.json({ version: "1.0.0", sections: { main: [{ hangup: {} }] } });
  await techHeard(job, body.call?.call_id ?? null);
  return NextResponse.json(buildTechSwml(job, await getBusiness(job.business_id), originOf(req), env.webhookSecret));
}
