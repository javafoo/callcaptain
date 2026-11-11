import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { hasWebhookKey } from "@/lib/env";
import { getBusiness } from "@/lib/settings";
import { techAccepted, techUnavailable } from "@/lib/tech-call";

/**
 * Tools for the agent's call to the technician (SWML from /api/swml/tech): accept_job and
 * decline_job. Same request shape as /api/swaig. Each reply ends the call once the agent has
 * said goodbye: `hangup` with `post_process` runs after it speaks
 * (https://signalwire.com/docs/swml/reference/calling/ai/swaig/functions).
 */

type SwaigRequest = {
  function?: string;
  argument?: { parsed?: Record<string, unknown>[] };
  call_id?: string;
  global_data?: { job_id?: string };
};

const goodbye = (response: string) => NextResponse.json({ response, action: [{ hangup: true }], post_process: true });

function minutesFrom(value: unknown): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 600 ? n : null;
}

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as SwaigRequest;
  const args = body.argument?.parsed?.[0] ?? {};
  const job = await getJob(new URL(req.url).searchParams.get("job") ?? body.global_data?.job_id ?? "");
  if (!job) return goodbye("The job record is missing. Say the office will call back, then say goodbye.");
  const b = await getBusiness(job.business_id);
  const tech = job.tech_name ?? b.technician;
  const customer = job.customer_name ?? "the customer";

  try {
    switch (body.function) {
      case "accept_job": {
        const { outcome } = await techAccepted(job, b, minutesFrom(args.eta_minutes));
        if (outcome === "off") return goodbye(`The job was called off before ${tech} answered, so there's no need to go out. Say sorry for the call, then goodbye.`);
        return goodbye(`Confirmed, and ${customer} is being told right now. Say: Thanks, ${tech}. I'll let ${customer} know you're on the way. Then say goodbye.`);
      }

      case "decline_job": {
        const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, 120) : "";
        if (/voice ?mail|machine|recording/i.test(reason)) {
          await techUnavailable(job, b, "no_answer", `${tech} didn't pick up. Voicemail answered, so ${b.agentName} left a short message.`, {
            from: ["calling"],
            tellCaller: true,
          });
          return NextResponse.json({ response: "Noted. The call ends now.", action: [{ hangup: true }] });
        }
        await techUnavailable(job, b, "declined", `${tech} can't take it${reason ? ` (${reason})` : ""}.`, { from: ["calling", "accepted"], tellCaller: true });
        return goodbye(`Noted, and the owner is being told. Say: No problem, I'll let the office know. Then say goodbye.`);
      }

      default:
        return NextResponse.json({ response: "Unknown function." });
    }
  } catch (e) {
    console.error("[swaig/tech]", body.function, e instanceof Error ? e.message : e);
    return goodbye(`That didn't save on our side. Tell ${tech} the office will follow up, then say goodbye.`);
  }
}
