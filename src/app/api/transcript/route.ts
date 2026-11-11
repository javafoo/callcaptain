import { NextResponse } from "next/server";
import { event, getJob, updateJob } from "@/lib/db";
import { hasWebhookKey } from "@/lib/env";

/**
 * AI debug webhook at level 2 (https://signalwire.com/docs/apis/rest/webhooks/ai-debug-webhook):
 * one `conversation_add { role, content }` per turn. We keep those as the live transcript
 * the call page shows next to the PayPal button.
 */

type DebugBody = { conversation_add?: { role?: string; content?: string } } & Record<string, unknown>;

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as DebugBody;
  const turn = body.conversation_add;
  if (!turn?.content || (turn.role !== "user" && turn.role !== "assistant")) return NextResponse.json({ ok: true });

  // The payment system's injected notice is a "user" turn in SignalWire's log; it isn't the caller.
  if (turn.role === "user" && turn.content.startsWith("(Notice from the payment system")) return NextResponse.json({ ok: true });

  const job = await getJob(new URL(req.url).searchParams.get("job") ?? "");
  if (job) await updateJob(job.id, {}, event(turn.role === "user" ? "caller" : "agent_said", turn.content.trim()));
  return NextResponse.json({ ok: true });
}
