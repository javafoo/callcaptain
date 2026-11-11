import { BUSINESS } from "./business";
import { dollars, event, updateJob, type Job } from "./db";
import {
  authorizeCard,
  authorizeOrder,
  captureAuthorization,
  createBalanceOrder,
  createHoldOrder,
  payerLabel,
  voidAuthorization,
} from "./paypal";
import { tellAgent } from "./signalwire";

/**
 * Every money moment of a job, in one place. Routes (the agent's SWAIG functions, the
 * PayPal button, the keypad connector, the owner dashboard) call these and nothing else.
 */

const HELD = new Set(["hold_placed", "dispatched"]);

export async function requestPayPalHold(job: Job): Promise<Job> {
  if (HELD.has(job.status)) return job;
  if (job.order_id && job.status === "awaiting_hold") return job;
  const order = await createHoldOrder(job.id, job.fee_cents, BUSINESS.name);
  return updateJob(
    job.id,
    { status: "awaiting_hold", order_id: order.id, hold_method: "paypal" },
    event("hold_requested", `Agent showed the PayPal button for a ${dollars(job.fee_cents)} hold`),
  );
}

/** The caller approved in the PayPal popup: place the hold, then tell the live agent. */
export async function confirmPayPalHold(job: Job, orderId: string): Promise<Job> {
  if (HELD.has(job.status)) return job;
  if (job.order_id !== orderId) throw new Error("That PayPal order does not belong to this job.");
  const { order, authorization } = await authorizeOrder(orderId);
  const updated = await updateJob(
    job.id,
    {
      status: "hold_placed",
      authorization_id: authorization.id,
      authorization_expires: authorization.expiration_time ?? null,
      card_last4: order.payment_source?.card?.last_digits ?? null,
    },
    event("hold_placed", `${dollars(job.fee_cents)} hold placed with ${payerLabel(order)}. Nothing charged yet.`),
  );
  if (updated.call_id) {
    await tellAgent(
      updated.call_id,
      `(Notice from the payment system, not spoken by the caller: the ${dollars(job.fee_cents)} PayPal hold was just approved. Thank the caller and call dispatch_technician now.)`,
    ).catch((e) => console.warn("[money] could not notify agent", e instanceof Error ? e.message : e));
  }
  return updated;
}

export type KeypadCard = { number: string; expiryMonth: string; expiryYear: string; cvv?: string; postalCode?: string };

/** SignalWire's pay connector posted the keypad card: hold it through PayPal. */
export async function holdKeypadCard(job: Job, card: KeypadCard): Promise<{ job: Job; authorizationId: string }> {
  if (HELD.has(job.status) && job.authorization_id) return { job, authorizationId: job.authorization_id };
  const { authorization } = await authorizeCard(job.id, job.fee_cents, BUSINESS.name, { ...card, name: job.customer_name ?? undefined });
  const last4 = card.number.slice(-4);
  const updated = await updateJob(
    job.id,
    {
      status: "hold_placed",
      hold_method: "keypad",
      authorization_id: authorization.id,
      authorization_expires: authorization.expiration_time ?? null,
      card_last4: last4,
    },
    event("hold_placed", `${dollars(job.fee_cents)} hold placed on card •••• ${last4}, typed on the keypad. The AI never heard it.`),
  );
  return { job: updated, authorizationId: authorization.id };
}

export async function dispatchTechnician(job: Job): Promise<Job> {
  if (job.status === "dispatched") return job;
  if (job.status !== "hold_placed") throw new Error("hold not placed");
  return updateJob(
    job.id,
    { status: "dispatched", tech_name: BUSINESS.technician, eta: BUSINESS.eta },
    event("dispatched", `${BUSINESS.technician} dispatched, arriving in ${BUSINESS.eta}`),
  );
}

export async function bookMorning(job: Job): Promise<Job> {
  return updateJob(job.id, { status: "scheduled", eta: BUSINESS.morningSlot }, event("scheduled", `No hold. Booked ${BUSINESS.morningSlot}`));
}

/**
 * The technician finished. Charge the final bill against the hold:
 *  - final ≤ hold: capture the final amount, the rest of the hold is released
 *  - final > hold: capture the whole hold, send the balance as a PayPal payment link
 *    (Pay Later is offered there on eligible amounts)
 */
export async function completeJob(job: Job, finalCents: number): Promise<Job> {
  if (!job.authorization_id || !HELD.has(job.status)) throw new Error("There is no active hold on this job.");
  if (!Number.isInteger(finalCents) || finalCents <= 0) throw new Error("Enter the final amount in dollars.");

  if (finalCents <= job.fee_cents) {
    const capture = await captureAuthorization(job.authorization_id, finalCents, `job-${job.id}`);
    const released = job.fee_cents - finalCents;
    return updateJob(
      job.id,
      { status: "completed", final_cents: finalCents, captured_cents: finalCents, balance_cents: 0 },
      event("captured", `Job done. Charged ${dollars(finalCents)} from the hold (capture ${capture.id})${released > 0 ? `, released ${dollars(released)}` : ""}.`),
    );
  }

  const capture = await captureAuthorization(job.authorization_id, job.fee_cents, `job-${job.id}`);
  const balance = finalCents - job.fee_cents;
  const order = await createBalanceOrder(job.id, balance, BUSINESS.name);
  return updateJob(
    job.id,
    { status: "balance_due", final_cents: finalCents, captured_cents: job.fee_cents, balance_cents: balance, balance_order_id: order.id },
    event("captured", `Job done (${dollars(finalCents)}). Charged the ${dollars(job.fee_cents)} hold (capture ${capture.id}).`),
    event("balance_sent", `Sent a PayPal link for the ${dollars(balance)} balance, with Pay Later on eligible amounts.`),
  );
}

/** Release the hold. Nothing is charged. */
export async function releaseHold(job: Job, reason: string): Promise<Job> {
  if (!job.authorization_id || !HELD.has(job.status)) throw new Error("There is no active hold on this job.");
  await voidAuthorization(job.authorization_id);
  return updateJob(job.id, { status: "released" }, event("released", `Hold released, nothing charged. ${reason}`));
}

/** Cancellation policy: free before dispatch; after dispatch keep the trip fee, release the rest. */
export async function cancelVisit(job: Job): Promise<{ job: Job; message: string }> {
  if (job.status === "dispatched" && job.authorization_id) {
    const capture = await captureAuthorization(job.authorization_id, BUSINESS.tripFeeCents, `job-${job.id}-trip`);
    const updated = await updateJob(
      job.id,
      { status: "cancelled_fee", captured_cents: BUSINESS.tripFeeCents, final_cents: BUSINESS.tripFeeCents },
      event("cancelled", `Cancelled after dispatch. Kept the ${dollars(BUSINESS.tripFeeCents)} trip fee (capture ${capture.id}), released the rest.`),
    );
    return { job: updated, message: `Cancelled. The technician was already on the way, so the ${dollars(BUSINESS.tripFeeCents)} trip fee was charged and the rest of the hold released.` };
  }
  if (job.status === "hold_placed" && job.authorization_id) {
    return { job: await releaseHold(job, "Caller cancelled before dispatch."), message: "Cancelled. The hold was released and nothing was charged." };
  }
  const updated = await updateJob(job.id, { status: "released" }, event("cancelled", "Caller cancelled. No hold existed."));
  return { job: updated, message: "Cancelled. Nothing was held or charged." };
}
