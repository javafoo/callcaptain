import type { Business } from "./business";
import { dollars, event, updateJob, type Job } from "./db";
import {
  authorizeCard,
  authorizeOrder,
  captureAuthorization,
  chargeSaved,
  createBalanceOrder,
  createHoldOrder,
  createPaymentToken,
  deletePaymentToken,
  payerLabel,
  voidAuthorization,
  type VaultKind,
} from "./paypal";
import { tellAgent } from "./signalwire";

/**
 * Every money moment of a job, in one place. Routes (the agent's SWAIG functions, the
 * PayPal button, the keypad connector, the owner dashboard) call these and nothing else.
 */

const HELD = new Set(["hold_placed", "dispatched"]);
/** The visit is secured (hold placed or card saved); the technician can be sent. */
export const SECURED = new Set(["hold_placed", "card_saved", "dispatched"]);
const onFile = (job: Job) => job.secure_with === "card" && Boolean(job.vault_id);
const vaultOf = (job: Job) => ({ id: job.vault_id!, type: (job.vault_type ?? "card") as VaultKind });

async function notifyAgent(job: Job, text: string) {
  if (!job.call_id) return;
  await tellAgent(job.call_id, `(Notice from the payment system, not spoken by the caller: ${text})`).catch((e) =>
    console.warn("[money] could not notify agent", e instanceof Error ? e.message : e),
  );
}

/** Card-on-file mode: show the "save a card or PayPal" form on the caller's screen. Nothing is charged. */
export async function requestCardOnFile(job: Job): Promise<Job> {
  if (SECURED.has(job.status)) return job;
  if (job.status === "awaiting_card") return job;
  return updateJob(
    job.id,
    { status: "awaiting_card", hold_method: "vault" },
    event("card_requested", "Agent showed the secure PayPal form to save a card or PayPal. $0 charged."),
  );
}

/** The caller approved in PayPal: save the payment method, then tell the live agent. */
export async function confirmCardOnFile(job: Job, setupTokenId: string): Promise<Job> {
  if (SECURED.has(job.status) && job.vault_id) return job;
  const saved = await createPaymentToken(setupTokenId);
  const updated = await updateJob(
    job.id,
    { status: "card_saved", hold_method: "vault", vault_id: saved.id, vault_type: saved.type, card_last4: saved.last4 },
    event("card_saved", `${saved.label} saved on file with PayPal. $0 charged.`),
  );
  await notifyAgent(updated, `the caller saved ${saved.type === "card" ? "a card" : saved.type === "venmo" ? "Venmo" : "PayPal"} on file with PayPal. Nothing was charged. Thank them and call dispatch_technician now.`);
  return updated;
}

export async function requestPayPalHold(job: Job, b: Business): Promise<Job> {
  if (HELD.has(job.status)) return job;
  if (job.order_id && job.status === "awaiting_hold") return job;
  const order = await createHoldOrder(job.id, job.fee_cents, b.businessName);
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
  await notifyAgent(updated, `the ${dollars(job.fee_cents)} PayPal hold was just approved. Thank the caller and call dispatch_technician now.`);
  return updated;
}

export type KeypadCard = { number: string; expiryMonth: string; expiryYear: string; cvv?: string; postalCode?: string };

/** SignalWire's pay connector posted the keypad card: hold it through PayPal. */
export async function holdKeypadCard(job: Job, b: Business, card: KeypadCard): Promise<{ job: Job; authorizationId: string }> {
  if (HELD.has(job.status) && job.authorization_id) return { job, authorizationId: job.authorization_id };
  const { authorization } = await authorizeCard(job.id, job.fee_cents, b.businessName, { ...card, name: job.customer_name ?? undefined });
  const last4 = card.number.slice(-4);
  const updated = await updateJob(
    job.id,
    {
      status: "hold_placed",
      hold_method: "keypad",
      authorization_id: authorization.id,
      authorization_expires: authorization.expiration_time ?? null,
      card_last4: last4,
      pay_step: "done",
    },
    event("hold_placed", `${dollars(job.fee_cents)} hold placed on card •••• ${last4}, typed on the keypad. The AI never heard it.`),
  );
  return { job: updated, authorizationId: authorization.id };
}

export async function dispatchTechnician(job: Job, b: Business): Promise<Job> {
  if (job.status === "dispatched") return job;
  if (job.status !== "hold_placed" && job.status !== "card_saved") throw new Error("visit not secured");
  return updateJob(
    job.id,
    { status: "dispatched", tech_name: b.technician, eta: b.eta },
    event("dispatched", `${b.technician} dispatched, arriving in ${b.eta}`),
  );
}

export async function bookMorning(job: Job, b: Business): Promise<Job> {
  return updateJob(job.id, { status: "scheduled", eta: b.morningSlot }, event("scheduled", `No hold. Booked ${b.morningSlot}`));
}

/**
 * The technician finished. Charge the final bill against the hold:
 *  - final ≤ hold: capture the final amount, the rest of the hold is released
 *  - final > hold: capture the whole hold, send the balance as a PayPal payment link
 *    (Pay Later is offered there on eligible amounts)
 */
export async function completeJob(job: Job, b: Business, finalCents: number): Promise<Job> {
  if (!Number.isInteger(finalCents) || finalCents <= 0) throw new Error("Enter the final amount in dollars.");

  // Card on file: the customer approved the final price with the technician; charge it in full.
  if (onFile(job)) {
    if (!SECURED.has(job.status)) throw new Error("This job has nothing left to charge.");
    const charge = await chargeSaved(vaultOf(job), finalCents, job.id, `${b.businessName}: repair, parts and labor`, `final-${job.id}`);
    return updateJob(
      job.id,
      { status: "paid", final_cents: finalCents, captured_cents: finalCents, balance_cents: 0, balance_order_id: charge.orderId },
      event("charged", `Job done. Charged ${dollars(finalCents)} to the card on file, as approved by the customer (capture ${charge.captureId}). PayPal emails the receipt.`),
    );
  }

  if (!job.authorization_id || !HELD.has(job.status)) throw new Error("There is no active hold on this job.");

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
  const order = await createBalanceOrder(job.id, balance, b.businessName);
  return updateJob(
    job.id,
    { status: "balance_due", final_cents: finalCents, captured_cents: job.fee_cents, balance_cents: balance, balance_order_id: order.id },
    event("captured", `Job done (${dollars(finalCents)}). Charged the ${dollars(job.fee_cents)} hold (capture ${capture.id}).`),
    event("balance_sent", `Sent a PayPal link for the ${dollars(balance)} balance, with Pay Later on eligible amounts.`),
  );
}

/** Release the hold. Nothing is charged. */
export async function releaseHold(job: Job, reason: string): Promise<Job> {
  if (onFile(job)) {
    if (!SECURED.has(job.status)) throw new Error("This job has no card on file to remove.");
    await deletePaymentToken(job.vault_id!).catch(() => {});
    return updateJob(job.id, { status: "released", vault_id: null }, event("released", `Card on file removed, nothing charged. ${reason}`));
  }
  if (!job.authorization_id || !HELD.has(job.status)) throw new Error("There is no active hold on this job.");
  await voidAuthorization(job.authorization_id);
  return updateJob(job.id, { status: "released" }, event("released", `Hold released, nothing charged. ${reason}`));
}

/** Cancellation policy: free before dispatch; after dispatch keep the trip fee, release the rest. */
export async function cancelVisit(job: Job, b: Business): Promise<{ job: Job; message: string }> {
  if (onFile(job)) {
    if (job.status === "dispatched") {
      const charge = await chargeSaved(vaultOf(job), b.tripFeeCents, job.id, `${b.businessName}: trip fee (cancelled after dispatch)`, `trip-${job.id}`);
      await deletePaymentToken(job.vault_id!).catch(() => {});
      const updated = await updateJob(
        job.id,
        { status: "cancelled_fee", captured_cents: b.tripFeeCents, final_cents: b.tripFeeCents, vault_id: null },
        event("cancelled", `Cancelled after dispatch. Charged the ${dollars(b.tripFeeCents)} trip fee to the card on file (capture ${charge.captureId}).`),
      );
      return { job: updated, message: `Cancelled. The technician was already on the way, so the ${dollars(b.tripFeeCents)} trip fee was charged to the card on file.` };
    }
    if (job.status === "card_saved") {
      return { job: await releaseHold(job, "Caller cancelled before dispatch."), message: "Cancelled. Nothing was charged and the card was removed." };
    }
  }
  if (job.status === "dispatched" && job.authorization_id) {
    const capture = await captureAuthorization(job.authorization_id, b.tripFeeCents, `job-${job.id}-trip`);
    const updated = await updateJob(
      job.id,
      { status: "cancelled_fee", captured_cents: b.tripFeeCents, final_cents: b.tripFeeCents },
      event("cancelled", `Cancelled after dispatch. Kept the ${dollars(b.tripFeeCents)} trip fee (capture ${capture.id}), released the rest.`),
    );
    return { job: updated, message: `Cancelled. The technician was already on the way, so the ${dollars(b.tripFeeCents)} trip fee was charged and the rest of the hold released.` };
  }
  if (job.status === "hold_placed" && job.authorization_id) {
    return { job: await releaseHold(job, "Caller cancelled before dispatch."), message: "Cancelled. The hold was released and nothing was charged." };
  }
  const updated = await updateJob(job.id, { status: "released" }, event("cancelled", "Caller cancelled. No hold existed."));
  return { job: updated, message: "Cancelled. Nothing was held or charged." };
}
