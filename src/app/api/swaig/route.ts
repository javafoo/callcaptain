import { NextResponse } from "next/server";
import { keypadPayAction } from "@/lib/agent";
import { inServiceArea, zipFrom } from "@/lib/business";
import { dollars, event, findJobByCall, getJob, updateJob, type Job } from "@/lib/db";
import { env, hasWebhookKey, originOf } from "@/lib/env";
import { bookMorning, cancelVisit, dispatchTechnician, requestPayPalHold } from "@/lib/money";
import { getBusiness } from "@/lib/settings";

/**
 * The agent's tools (SWAIG functions). SignalWire POSTs
 * { function, argument: { parsed: [args] }, call_id, global_data } and expects
 * { response, action? } (https://signalwire.com/docs/swml/reference/calling/ai/swaig).
 *
 * The rules that matter (service area, no dispatch without a hold) are enforced here,
 * in code, whatever the model decides to try.
 */

type SwaigRequest = {
  function?: string;
  argument?: { parsed?: Record<string, unknown>[] };
  call_id?: string;
  global_data?: { job_id?: string };
};

const reply = (response: string, action?: unknown[]) => NextResponse.json(action ? { response, action } : { response });
const HELD = new Set(["hold_placed", "dispatched"]);

export async function POST(req: Request) {
  if (!hasWebhookKey(req)) return new NextResponse("forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as SwaigRequest;
  const args = body.argument?.parsed?.[0] ?? {};
  const jobId = body.global_data?.job_id ?? new URL(req.url).searchParams.get("job") ?? "";

  let job: Job | null = await getJob(jobId);
  if (!job && body.call_id) job = await findJobByCall(body.call_id);
  if (!job) return reply("The job record is missing. Apologize and ask the caller to call back.");
  const b = await getBusiness();

  const outOfArea = () =>
    reply(`This address is outside ${b.businessName}'s service area, so you cannot send anyone or take a hold. Apologize kindly and suggest they call a local company.`);

  try {
    switch (body.function) {
      case "save_job_details": {
        const str = (k: string) => (typeof args[k] === "string" && (args[k] as string).trim() ? (args[k] as string).trim() : null);
        const zip = zipFrom(str("zip_code")) ?? zipFrom(str("service_address"));
        const area = inServiceArea(b, zip);
        job = await updateJob(
          job.id,
          {
            customer_name: str("customer_name") ?? job.customer_name,
            service_address: str("service_address") ?? job.service_address,
            zip: zip ?? job.zip,
            issue: str("issue") ?? job.issue,
            urgency: str("urgency") ?? job.urgency,
            callback_phone: str("callback_phone") ?? job.callback_phone,
            ...(area === false ? { status: "out_of_area" as const } : {}),
          },
          event("details", `${str("customer_name") ?? "Caller"} at ${str("service_address") ?? "unknown address"}${zip ? ` ${zip}` : ""}: ${str("issue") ?? ""}`),
          ...(area === false ? [event("out_of_area", `ZIP ${zip} is outside the service area. No hold, no dispatch.`)] : []),
        );
        if (area === null) return reply("Saved, but I still need the five-digit ZIP code to check the service area. Ask for it, then call save_job_details again.");
        if (area === false) return outOfArea();
        return reply(
          `Saved, and the address is in the service area. The after-hours service call is ${dollars(job.fee_cents)}, applied to the repair. It is held now and charged only after the work. Free cancellation until the technician heads out; after that a ${dollars(b.tripFeeCents)} trip fee applies. Explain this simply and ask if they'd like to place the hold.`,
        );
      }

      case "start_paypal_hold": {
        if (job.status === "out_of_area") return outOfArea();
        if (HELD.has(job.status)) return reply("The hold is already placed. Dispatch the technician if you have not.");
        job = await requestPayPalHold(job, b);
        return reply(
          `The PayPal button for the ${dollars(job.fee_cents)} hold is now on the caller's screen. Ask them to tap it and approve with PayPal, Venmo or a card. You will get a notice the moment it is approved. Meanwhile, give one practical tip.`,
        );
      }

      case "take_card_on_keypad": {
        if (job.status === "out_of_area") return outOfArea();
        if (HELD.has(job.status)) return reply("The hold is already placed. Dispatch the technician if you have not.");
        job = await updateJob(
          job.id,
          { status: "awaiting_hold", hold_method: "keypad", pay_step: "starting" },
          event("hold_requested", "Agent handed the caller to the secure keypad. The AI can't hear the digits."),
        );
        return reply("In one short sentence, tell the caller a secure keypad will now ask for the card one item at a time, and that you won't hear the numbers. Then stop talking.", [
          keypadPayAction(job, b, originOf(req), env.webhookSecret),
        ]);
      }

      case "check_hold": {
        if (job.status === "hold_placed") return reply("Approved. Thank them and call dispatch_technician now.");
        if (job.status === "dispatched") return reply(`Already approved and ${job.tech_name} is on the way, arriving in ${job.eta}.`);
        return reply("Not approved yet. Ask if the PayPal window opened, and offer the keypad if it's giving them trouble.");
      }

      case "dispatch_technician": {
        if (job.status === "out_of_area") return outOfArea();
        if (!HELD.has(job.status)) {
          return reply("The hold is not approved yet, so you can't dispatch. Help them finish the hold, or offer the morning slot.");
        }
        job = await dispatchTechnician(job, b);
        return reply(
          `${job.tech_name} is dispatched and will arrive in ${job.eta}. The technician quotes the repair before starting any work. The final bill can be paid with PayPal, including Pay Later. Tell the caller, then ask if there's anything else.`,
        );
      }

      case "book_morning_slot": {
        if (job.status === "out_of_area") return outOfArea();
        job = await bookMorning(job, b);
        return reply(`Booked ${b.morningSlot}, no hold needed. Confirm the time and remind them to keep the water shut off.`);
      }

      case "cancel_visit": {
        const { message } = await cancelVisit(job, b);
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
