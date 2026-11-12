import { NextResponse } from "next/server";
import { checkArea } from "@/lib/area";
import { zipFrom, type Business } from "@/lib/business";
import { dollars, event, findJobByCall, getJob, updateJob, type Job } from "@/lib/db";
import { env, hasWebhookKey, originOf } from "@/lib/env";
import { estimateEta } from "@/lib/eta";
import { SECURED, bookMorning, cancelVisit, dispatchTechnician, requestCardOnFile, requestPayPalHold } from "@/lib/money";
import { notify } from "@/lib/notify";
import { getBusiness } from "@/lib/settings";
import { arrivingIn, settleStaleCall, startTechCall, unavailableNote } from "@/lib/tech-call";

/**
 * The agent's tools (SWAIG functions). SignalWire POSTs
 * { function, argument: { parsed: [args] }, call_id, global_data } and expects
 * { response, action? } (https://signalwire.com/docs/swml/reference/calling/ai/swaig).
 *
 * The rules that matter (service area, no dispatch without a hold) are enforced here,
 * in code, whatever the model decides to try.
 */

/** dispatch_technician keeps watching the technician's call for up to 45 seconds after it replies (./tech-call.ts). */
export const maxDuration = 60;

const UNAVAILABLE = new Set(["declined", "no_answer", "failed"]);
const onFile = (job: Job) => job.secure_with === "card" && Boolean(job.vault_id);

/** Where the technician stands, for check_hold and check_technician once the visit is secured. */
function techNow(job: Job, b: Business): string {
  const tech = job.tech_name ?? b.technician;
  const eta = arrivingIn(job.eta ?? b.eta);
  if (job.tech_status === "calling") return `You're getting ${tech} on the line now. Tell the caller you'll confirm in a moment; you'll get a notice as soon as there's an answer from ${tech}.`;
  if (job.tech_status === "accepted") return `${tech} confirmed by phone and is on the way, arriving ${eta}.`;
  if (job.tech_status && UNAVAILABLE.has(job.tech_status)) return unavailableNote(job, b, job.tech_status);
  return `${tech} is on the way, arriving ${eta}.`;
}

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
  const b = await getBusiness(job.business_id);

  const outOfArea = () =>
    reply(`This address is outside ${b.businessName}'s service area (${b.serviceAreaText}), so you cannot send anyone or take a hold. Apologize kindly and suggest they call a local company.`);

  try {
    switch (body.function) {
      case "save_job_details": {
        const str = (k: string) => (typeof args[k] === "string" && (args[k] as string).trim() ? (args[k] as string).trim() : null);
        const zip = zipFrom(str("zip_code")) ?? zipFrom(str("service_address"));
        let check = await checkArea(b, zip);
        // Not a real ZIP: usually misheard, so ask once more. Same ZIP twice: don't trap a real
        // emergency, go ahead and flag it for the owner to check.
        const askAgain = Boolean(check.noSuchZip && job.zip !== zip);
        if (check.noSuchZip && !askAgain) check = { inArea: true, place: null, unverified: true };
        const area = check.inArea;
        const where = check.place ? `${check.place.city}, ${check.place.state} (${check.place.county})` : null;
        const firstDetails = !job.customer_name && !job.issue;
        // In the area: how soon the technician can be there, from the technician's starting ZIP to this one.
        const estimate = area === true ? await estimateEta(b, zip ?? job.zip).catch(() => null) : null;
        job = await updateJob(
          job.id,
          {
            customer_name: str("customer_name") ?? job.customer_name,
            service_address: str("service_address") ?? job.service_address,
            zip: zip ?? job.zip,
            issue: str("issue") ?? job.issue,
            urgency: str("urgency") ?? job.urgency,
            callback_phone: str("callback_phone") ?? job.callback_phone,
            ...(area === true ? { eta: estimate?.window ?? b.eta } : {}),
            ...(area === false ? { status: "out_of_area" as const } : area === true && job.status === "out_of_area" ? { status: "on_call" as const } : {}),
          },
          event("details", `${str("customer_name") ?? "Caller"} at ${str("service_address") ?? "unknown address"}${zip ? ` ${zip}` : ""}: ${str("issue") ?? ""}`),
          ...(area === false ? [event("out_of_area", `${where ?? `ZIP ${zip}`} is outside the service area (${b.serviceAreaText}). No hold, no dispatch.`)] : []),
          ...(area === true && where ? [event("in_area", `${where} is inside the service area.`)] : []),
          ...(estimate
            ? [event("eta", `Arrival estimate ${estimate.window}, ${estimate.miles < 1 ? "under a mile" : `about ${estimate.miles} mile${estimate.miles === 1 ? "" : "s"}`} from ${b.baseZip}.`)]
            : []),
          ...(askAgain ? [event("zip_unknown", `ZIP ${zip} doesn't exist. Asked the caller to repeat it.`)] : []),
          ...(check.unverified ? [event("area_unverified", `Couldn't verify ZIP ${zip}. Accepted; check the address before the visit.`)] : []),
        );
        if (firstDetails) {
          notify(
            job,
            "new_call",
            `New ${job.urgency === "emergency" ? "emergency" : "call"} · ${job.customer_name ?? "Caller"}${area === false ? " (outside your area)" : ""}`,
            [job.issue, job.service_address].filter(Boolean).join(" · "),
          );
        }
        if (askAgain) {
          return reply(
            `ZIP code ${zip} doesn't exist, so it was probably misheard. Say you didn't quite catch the ZIP code and ask them to say it again slowly, then call save_job_details again.`,
          );
        }
        if (area === null) return reply("Saved, but I still need the five-digit ZIP code to check the service area. Ask for it, then call save_job_details again.");
        if (area === false) {
          return reply(
            `${where ? `That address is in ${where}, which is` : "That address is"} outside ${b.businessName}'s service area: ${b.serviceAreaText}. You cannot send anyone or take a hold. Apologize kindly, tell them the area you do cover, and suggest a local company. Never guess or invent a reason why a place isn't covered. If they say it should be covered, take their callback number and tell them the owner will review it and call back in the morning.`,
          );
        }
        // Arrival time first, money only once the caller is okay with it. Card on file needs a screen,
        // so phone calls hold the service call on the keypad whatever the owner's setting.
        const when = arrivingIn(job.eta ?? b.eta);
        return reply(
          `Saved${check.unverified ? ". The ZIP couldn't be confirmed, so the owner will double-check the address; carry on normally" : ", and the address is in the service area"}. ${b.technician} can be there ${when}. First tell the caller just that and ask if it works, like: ${b.technician} can be there ${when}. Does that work for you? Then stop and wait for their answer. Once they say yes: ${
            job.secure_with === "card" && job.channel === "web"
              ? `To send someone tonight, they save a card or PayPal on file with PayPal. Nothing is charged tonight. The after-hours service call is ${dollars(job.fee_cents)}, part of the final bill; the technician goes over the final price on site and it is charged to that card only after they agree. Cancelling is free until the technician heads out; after that a ${dollars(b.tripFeeCents)} trip fee is charged to the card. Explain it in two short sentences, then ask if that works.`
              : `The after-hours service call is ${dollars(job.fee_cents)}, applied to the repair. It is held now and charged only after the work. Free cancellation until the technician heads out; after that a ${dollars(b.tripFeeCents)} trip fee applies. Explain it in two or three short sentences, like: It's a ${dollars(job.fee_cents)} after-hours visit that goes toward the repair. I'll hold it now, and nothing's charged until the work is done. If you cancel after the tech heads out, there's a ${dollars(b.tripFeeCents)} trip fee. Okay to place the hold?`
          } If the time doesn't work for them, offer the first morning slot instead.`,
        );
      }

      case "take_card_on_keypad":
        // Phone calls: hand the call to SignalWire's secure keypad. Web calls never get this function
        // (SignalWire drops a browser call on that hand-off); if an old session asks, show the card form.
        if (job.channel !== "web") {
          if (job.status === "out_of_area") return outOfArea();
          const onFile = job.secure_with === "card";
          if (SECURED.has(job.status)) return reply(`The ${onFile ? "card is already saved" : "hold is already placed"}. Dispatch the technician if you have not.`);
          job = await updateJob(
            job.id,
            { status: onFile ? "awaiting_card" : "awaiting_hold", hold_method: "keypad", pay_step: "starting" },
            event(
              onFile ? "card_requested" : "hold_requested",
              `Agent handed the caller to the secure keypad${onFile ? " to save a card on file, $0" : ""}. The AI can't hear the digits.`,
            ),
          );
          // `stop` ends this AI session; the call's SWML then continues to the keypad (/api/swml?after_ai=1).
          return reply("Handing the caller to the secure keypad now.", [{ stop: true }]);
        }
      // falls through
      case "save_card_on_file": {
        if (job.status === "out_of_area") return outOfArea();
        if (SECURED.has(job.status)) return reply("The card is already on file. Dispatch the technician if you have not.");
        job = await requestCardOnFile(job);
        return reply(
          `A secure PayPal form is now on the caller's screen. They can save PayPal, or type a debit or credit card in the card boxes and tap Save card. Nothing is charged. You will get a notice the moment it's saved. Meanwhile, give one practical tip.`,
        );
      }

      case "start_paypal_hold": {
        if (job.status === "out_of_area") return outOfArea();
        if (SECURED.has(job.status)) return reply("The hold is already placed. Dispatch the technician if you have not.");
        job = await requestPayPalHold(job, b);
        return reply(
          `The PayPal button for the ${dollars(job.fee_cents)} hold is now on the caller's screen. Ask them to approve with PayPal or Venmo, or tap "Debit or Credit Card" to type a card. You will get a notice the moment it is approved. Meanwhile, give one practical tip.`,
        );
      }

      case "check_hold": {
        job = await settleStaleCall(job, b);
        if (job.tech_status && UNAVAILABLE.has(job.tech_status)) return reply(techNow(job, b));
        if (job.status === "hold_placed" || job.status === "card_saved") return reply("Done. Thank them and call dispatch_technician now.");
        if (job.status === "awaiting_card") return reply("Not saved yet. Ask if they see the PayPal form. They can tap PayPal, or type a card in the boxes and tap Save card.");
        if (job.status === "dispatched") return reply(`Already approved. ${techNow(job, b)}`);
        return reply(job.channel === "web" ? 'Not approved yet. Ask if the PayPal window opened. If it is giving them trouble, the "Debit or Credit Card" button works too.' : "Not approved yet. Offer to try the keypad again, or the morning slot.");
      }

      case "dispatch_technician": {
        if (job.status === "out_of_area") return outOfArea();
        job = await settleStaleCall(job, b);
        // The technician already said no (or never answered): the owner is on it. Never ring them twice.
        if (job.tech_status && job.tech_status !== "accepted") return reply(techNow(job, b));
        if (!SECURED.has(job.status)) {
          return reply(
            job.secure_with === "card"
              ? "No card is on file yet, so you can't dispatch. Help them finish saving it, or offer the morning slot."
              : "The hold is not approved yet, so you can't dispatch. Help them finish the hold, or offer the morning slot.",
          );
        }
        if (job.status === "dispatched") return reply(`Already dispatched. ${techNow(job, b)}`);
        job = await dispatchTechnician(job, b);
        const call = await startTechCall(job, b, originOf(req), env.webhookSecret);
        if (call.kind === "calling" || call.kind === "already") {
          const tech = job.tech_name ?? b.technician;
          return reply(
            `Calling ${tech} now to confirm the job. Tell the caller you're getting ${tech} on the line and will confirm in a moment, then give one practical tip while they wait. Don't say ${tech} confirmed until a notice tells you.`,
          );
        }
        if (call.kind === "failed") return reply(unavailableNote(call.job, b, "failed"));
        // No technician phone (or this call couldn't be placed and the owner was told): dispatched as before.
        const eta = arrivingIn(job.eta ?? b.eta);
        return reply(
          onFile(job)
            ? `${job.tech_name} is dispatched and will arrive ${eta}. The technician goes over the price before starting any work, and the final bill goes on the card on file once they agree. Tell the caller, then ask if there's anything else.`
            : `${job.tech_name} is dispatched and will arrive ${eta}. The technician quotes the repair before starting any work. The final bill can be paid with PayPal, including Pay Later. Tell the caller, then ask if there's anything else.`,
        );
      }

      case "check_technician": {
        job = await settleStaleCall(job, b);
        if (!job.tech_status && job.status !== "dispatched") return reply(`${job.tech_name ?? b.technician} hasn't been sent yet. The visit has to be secured first.`);
        return reply(techNow(job, b));
      }

      case "book_morning_slot": {
        if (job.status === "out_of_area") return outOfArea();
        job = await bookMorning(job, b);
        return reply(`Booked ${b.morningSlot}, nothing needed up front. Confirm the time and remind them to keep the water shut off.`);
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
