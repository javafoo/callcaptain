import { NextResponse } from "next/server";
import { event, getJob, updateJob } from "@/lib/db";
import { hasWebhookKey } from "@/lib/env";

/**
 * End-of-call report (https://signalwire.com/docs/apis/rest/webhooks/ai-post-prompt-callback).
 * The post_prompt asked the model for a JSON ticket for the technician; we save it on the job.
 */

type PostPrompt = {
  action?: string;
  post_prompt_data?: { parsed?: Record<string, unknown>[]; raw?: string };
};

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as PostPrompt;
  if (body.action && body.action !== "post_conversation") return NextResponse.json({});

  const job = await getJob(new URL(req.url).searchParams.get("job") ?? "");
  if (!job) return NextResponse.json({});

  let summary = body.post_prompt_data?.parsed?.[0] ?? null;
  if (!summary && body.post_prompt_data?.raw) {
    try {
      summary = JSON.parse(body.post_prompt_data.raw.replace(/^```json\s*|```$/g, ""));
    } catch {
      summary = { summary: body.post_prompt_data.raw };
    }
  }
  // The first AI session also ends when it hands the call to the secure keypad; that isn't the end of the call.
  const handingOff = job.hold_method === "keypad" && job.status === "awaiting_hold" && job.pay_step !== null;
  await updateJob(job.id, { summary }, ...(handingOff ? [] : [event("call_ended", "Call ended. AI wrote the technician's ticket.")]));
  return NextResponse.json({});
}
