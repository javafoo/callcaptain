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
  if (!turn) {
    // Function calls, errors and other agent events: logged for debugging, never stored.
    const kind = Object.keys(body).find((k) => k !== "call_info") ?? "unknown";
    console.log("[agent-debug]", kind, JSON.stringify(body[kind]).slice(0, 600));
  }
  if (!turn?.content || (turn.role !== "user" && turn.role !== "assistant")) return NextResponse.json({ ok: true });

  // The payment system's injected notice is a "user" turn in SignalWire's log; it isn't the caller.
  if (turn.role === "user" && turn.content.startsWith("(Notice from the payment system")) return NextResponse.json({ ok: true });

  // The post_prompt's JSON ticket also arrives as an assistant turn; it belongs in the ticket, not the transcript.
  if (turn.role === "assistant" && /^\s*(```|\{)/.test(turn.content)) return NextResponse.json({ ok: true });

  const job = await getJob(new URL(req.url).searchParams.get("job") ?? "");
  // Never keep anything card-length (12+ digits), even if one slips through as keypad text.
  const text = turn.content.trim().replace(/\d[\d\s-]{10,}\d/g, (m) => (m.replace(/\D/g, "").length >= 12 ? "•".repeat(16) : m));
  if (job) await updateJob(job.id, {}, event(turn.role === "user" ? "caller" : "agent_said", text));
  return NextResponse.json({ ok: true });
}
