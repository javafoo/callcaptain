import { NextResponse } from "next/server";
import { keypadPayAction } from "@/lib/agent";
import { BUSINESS } from "@/lib/business";
import { dollars, event, findJobByCall, getJob, updateJob, type Job } from "@/lib/db";
import { env, hasWebhookKey, originOf } from "@/lib/env";
import { bookMorning, cancelVisit, dispatchTechnician, requestPayPalHold } from "@/lib/money";

/**
 * The agent's tools (SWAIG functions). SignalWire POSTs
 * { function, argument: { parsed: [args] }, call_id, global_data } and expects
 * { response, action? } (https://signalwire.com/docs/swml/reference/calling/ai/swaig).
 */

type SwaigRequest = {
  function?: string;
  argument?: { parsed?: Record<string, unknown>[] };
  call_id?: string;
  global_data?: { job_id?: string };
};

const reply = (response: string, action?: unknown[]) => NextResponse.json(action ? { response, action } : { response });

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as SwaigRequest;
  const args = body.argument?.parsed?.[0] ?? {};
  const jobId = body.global_data?.job_id ?? new URL(req.url).searchParams.get("job") ?? "";

  let job: Job | null = await getJob(jobId);
  if (!job && body.call_id) job = await findJobByCall(body.call_id);
  if (!job) return reply("The job record is missing. Apologize and ask the caller to call back.");

  try {
    switch (body.function) {
      case "save_job_details": {
        const str = (k: string) => (typeof args[k] === "string" && (args[k] as string).trim() ? (args[k] as string).trim() : null);
        job = await updateJob(
          job.id,
          {
            customer_name: str("customer_name") ?? job.customer_name,
            service_address: str("service_address") ?? job.service_address,
            issue: str("issue") ?? job.issue,
            urgency: str("urgency") ?? job.urgency,
            callback_phone: str("callback_phone") ?? job.callback_phone,
          },
          event("details", `${str("customer_name") ?? "Caller"} at ${str("service_address") ?? "unknown address"}: ${str("issue") ?? ""}`),
        );
        return reply(
          `Saved. The after-hours service call is ${dollars(job.fee_cents)}, applied to the repair. It is held now and charged only after the work. Free cancellation until the technician heads out; after that a ${dollars(BUSINESS.tripFeeCents)} trip fee applies. Explain this simply and ask if they'd like to place the hold.`,
        );
      }

      case "start_paypal_hold": {
        if (job.status === "hold_placed" || job.status === "dispatched") return reply("The hold is already placed. Dispatch the technician if you have not.");
        job = await requestPayPalHold(job);
        return reply(
          `The PayPal button for the ${dollars(job.fee_cents)} hold is now on the caller's screen, under the call button. Ask them to tap it and approve with PayPal, Venmo or a card. You will get a notice the moment it is approved. Meanwhile, give one practical tip.`,
        );
      }

      case "take_card_on_keypad": {
        if (job.status === "hold_placed" || job.status === "dispatched") return reply("The hold is already placed. Dispatch the technician if you have not.");
        job = await updateJob(job.id, { status: "awaiting_hold", hold_method: "keypad" }, event("hold_requested", "Agent handed the caller to the secure keypad. The AI can't hear the digits."));
        return reply("Tell the caller you're handing them to a secure keypad for the card, and that you won't hear the numbers.", [
          keypadPayAction(job, originOf(req), env.webhookSecret),
        ]);
      }

      case "check_hold": {
        if (job.status === "hold_placed") return reply("Approved. Thank them and call dispatch_technician now.");
        if (job.status === "dispatched") return reply(`Already approved and ${job.tech_name} is on the way, arriving in ${job.eta}.`);
        return reply("Not approved yet. Ask if the PayPal window opened, and offer the keypad if it's giving them trouble.");
      }

      case "dispatch_technician": {
        if (job.status !== "hold_placed" && job.status !== "dispatched") {
          return reply("The hold is not approved yet, so you can't dispatch. Help them finish the hold, or offer the morning slot.");
        }
        job = await dispatchTechnician(job);
        return reply(
          `${job.tech_name} is dispatched and will arrive in ${job.eta}. He'll quote the repair before starting any work. The final bill can be paid with PayPal, including Pay Later. Tell the caller, then ask if there's anything else.`,
        );
      }

      case "book_morning_slot": {
        job = await bookMorning(job);
        return reply(`Booked ${BUSINESS.morningSlot}, no hold needed. Confirm the time and remind them to keep the water shut off.`);
      }

      case "cancel_visit": {
        const { message } = await cancelVisit(job);
        return reply(`${message} Tell the caller kindly.`);
      }

      default:
        return reply("Unknown function.");
    }
  } catch (e) {
    console.error("[swaig]", body.function, e instanceof Error ? e.message : e);
    await updateJob(job.id, {}, event("error", `${body.function} failed: ${e instanceof Error ? e.message : "error"}`)).catch(() => {});
    return reply("That didn't go through on our side. Apologize, and offer the first morning slot instead.");
  }
}
