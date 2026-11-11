import { NextResponse } from "next/server";
import { event, getJob, updateJob } from "@/lib/db";
import { hasWebhookKey } from "@/lib/env";
import { notify } from "@/lib/notify";

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
  // Hung up before anything was secured or booked: close the job instead of leaving it "on the call".
  const unfinished = !handingOff && ["on_call", "awaiting_hold", "awaiting_card"].includes(job.status);
  const updated = await updateJob(
    job.id,
    { summary, ...(unfinished ? { status: "ended" as const } : {}) },
    ...(handingOff ? [] : [event("call_ended", unfinished ? "Call ended before a visit was secured. AI wrote a summary." : "Call ended. AI wrote the technician's ticket.")]),
  );
  if (unfinished && (updated.customer_name || updated.issue || updated.callback_phone)) {
    notify(
      updated,
      "follow_up",
      `Call back · ${updated.customer_name ?? "a caller"}`,
      [updated.issue, updated.callback_phone ? `Callback ${updated.callback_phone}` : null, "Hung up before the visit was secured."].filter(Boolean).join(" · "),
    );
  }
  return NextResponse.json({});
}
