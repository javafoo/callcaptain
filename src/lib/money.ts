import type { Business } from "./business";
import { dollars, event, updateJob, type Job } from "./db";
import { recordPayment } from "./ledger";
import { notify } from "./notify";
import {
  authorizeCard,
  authorizeOrder,
  captureAuthorization,
  captureOrder,
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
 * PayPal buttons, the keypad connector, the owner dashboard, PayPal webhooks) call these and
 * nothing else. Each one updates the job, writes the payments ledger and alerts the owner.
 */

const HELD = new Set(["hold_placed", "dispatched"]);
/** The visit is secured (hold placed or card saved); the technician can be sent. */
export const SECURED = new Set(["hold_placed", "card_saved", "dispatched"]);
const onFile = (job: Job) => job.secure_with === "card" && Boolean(job.vault_id);
const vaultOf = (job: Job) => ({ id: job.vault_id!, type: (job.vault_type ?? "card") as VaultKind });
const who = (job: Job) => job.customer_name ?? "A caller";
const where = (job: Job) => [job.service_address, job.zip && !job.service_address?.includes(job.zip) ? job.zip : null].filter(Boolean).join(" ");

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
    {
      status: "card_saved",
      hold_method: "vault",
      vault_id: saved.id,
      vault_type: saved.type,
      card_last4: saved.last4,
      payer_email: saved.email ?? job.payer_email,
    },
    event("card_saved", `${saved.label} saved on file with PayPal. $0 charged.`),
  );
  await Promise.all([
    notifyAgent(
      updated,
      `the caller saved ${saved.type === "card" ? "a card" : saved.type === "venmo" ? "Venmo" : "PayPal"} on file with PayPal. Nothing was charged. Thank them and call dispatch_technician now.`,
    ),
    recordPayment(updated, { kind: "card_saved", status: "SAVED", amountCents: 0, paypalId: saved.id, method: saved.label }),
  ]);
  notify(updated, "secured", `Card on file · ${who(updated)}`, `${saved.label} saved with PayPal, $0 charged. ${updated.issue ?? ""}`.trim());
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
  const method = payerLabel(order);
  const updated = await updateJob(
    job.id,
    {
      status: "hold_placed",
      authorization_id: authorization.id,
      authorization_expires: authorization.expiration_time ?? null,
      card_last4: order.payment_source?.card?.last_digits ?? null,
      payer_email: order.payer?.email_address ?? job.payer_email,
    },
    event("hold_placed", `${dollars(job.fee_cents)} hold placed with ${method}. Nothing charged yet.`),
  );
  await Promise.all([
    notifyAgent(updated, `the ${dollars(job.fee_cents)} PayPal hold was just approved. Thank the caller and call dispatch_technician now.`),
    recordPayment(updated, { kind: "hold", status: authorization.status, amountCents: job.fee_cents, paypalId: authorization.id, orderId, method }),
  ]);
  notify(updated, "secured", `${dollars(job.fee_cents)} hold placed · ${who(updated)}`, `${method}, nothing charged yet. ${updated.issue ?? ""}`.trim());
  return updated;
}

export type KeypadCard = { number: string; expiryMonth: string; expiryYear: string; cvv?: string; postalCode?: string };

/** SignalWire's pay connector posted the keypad card: hold it through PayPal. */
export async function holdKeypadCard(job: Job, b: Business, card: KeypadCard): Promise<{ job: Job; authorizationId: string }> {
  if (HELD.has(job.status) && job.authorization_id) return { job, authorizationId: job.authorization_id };
  const { order, authorization } = await authorizeCard(job.id, job.fee_cents, b.businessName, { ...card, name: job.customer_name ?? undefined });
  const last4 = card.number.slice(-4);
  const updated = await updateJob(
    job.id,
    {
      status: "hold_placed",
      hold_method: "keypad",
      order_id: order.id,
      authorization_id: authorization.id,
      authorization_expires: authorization.expiration_time ?? null,
      card_last4: last4,
      pay_step: "done",
    },
    event("hold_placed", `${dollars(job.fee_cents)} hold placed on card •••• ${last4}, typed on the keypad. The AI never heard it.`),
  );
  await recordPayment(updated, {
    kind: "hold",
    status: authorization.status,
    amountCents: job.fee_cents,
    paypalId: authorization.id,
    orderId: order.id,
    method: `Card •••• ${last4} (keypad)`,
  });
  notify(updated, "secured", `${dollars(job.fee_cents)} hold placed · ${who(updated)}`, `Card •••• ${last4} on the phone keypad. ${updated.issue ?? ""}`.trim());
  return { job: updated, authorizationId: authorization.id };
}

export async function dispatchTechnician(job: Job, b: Business): Promise<Job> {
  if (job.status === "dispatched") return job;
  if (job.status !== "hold_placed" && job.status !== "card_saved") throw new Error("visit not secured");
  const updated = await updateJob(
    job.id,
    { status: "dispatched", tech_name: b.technician, eta: b.eta },
    event("dispatched", `${b.technician} dispatched, arriving in ${b.eta}`),
  );
  notify(updated, "dispatched", `${b.technician} dispatched · ${who(updated)}`, [where(updated), updated.issue].filter(Boolean).join(" · "));
  return updated;
}

export async function bookMorning(job: Job, b: Business): Promise<Job> {
  const updated = await updateJob(job.id, { status: "scheduled", eta: b.morningSlot }, event("scheduled", `No hold. Booked ${b.morningSlot}`));
  notify(updated, "booked", `Booked ${b.morningSlot} · ${who(updated)}`, [updated.issue, updated.callback_phone].filter(Boolean).join(" · "));
  return updated;
}

/**
 * The technician finished. Charge the final bill:
 *  - card on file: charge the saved method in full (the customer approved the amount)
 *  - final ≤ hold: capture the final amount, the rest of the hold is released
 *  - final > hold: capture the whole hold, send the balance as a PayPal payment link
 *    (Pay Later is offered there on eligible amounts)
 */
export async function completeJob(job: Job, b: Business, finalCents: number): Promise<Job> {
  if (!Number.isInteger(finalCents) || finalCents <= 0) throw new Error("Enter the final amount in dollars.");
  const now = new Date().toISOString();

  if (onFile(job)) {
    if (!SECURED.has(job.status) && job.status !== "awaiting_approval") throw new Error("This job has nothing left to charge.");
    const charge = await chargeSaved(vaultOf(job), finalCents, job.id, `${b.businessName}: repair, parts and labor`, `final-${job.id}`);
    const updated = await updateJob(
      job.id,
      { status: "paid", final_cents: finalCents, captured_cents: finalCents, balance_cents: 0, balance_order_id: charge.orderId, completed_at: now },
      event("charged", `Job done. Charged ${dollars(finalCents)} to the card on file, as approved by the customer (capture ${charge.captureId}).`),
    );
    await recordPayment(updated, {
      kind: "card_charge",
      status: "COMPLETED",
      amountCents: finalCents,
      paypalId: charge.captureId,
      orderId: charge.orderId,
      method: job.vault_type === "card" ? `Card •••• ${job.card_last4 ?? ""}`.trim() : job.vault_type === "venmo" ? "Venmo" : "PayPal",
      note: "Final bill, card on file",
    });
    return updated;
  }

  if (!job.authorization_id || !HELD.has(job.status)) throw new Error("There is no active hold on this job.");
  const heldWith = job.hold_method === "keypad" ? `Card •••• ${job.card_last4 ?? ""} (keypad)` : job.card_last4 ? `Card •••• ${job.card_last4}` : "PayPal";

  if (finalCents <= job.fee_cents) {
    const capture = await captureAuthorization(job.authorization_id, finalCents, `job-${job.id}`);
    const released = job.fee_cents - finalCents;
    const updated = await updateJob(
      job.id,
      { status: "completed", final_cents: finalCents, captured_cents: finalCents, balance_cents: 0, completed_at: now },
      event("captured", `Job done. Charged ${dollars(finalCents)} from the hold (capture ${capture.id})${released > 0 ? `, released ${dollars(released)}` : ""}.`),
    );
    await recordPayment(updated, {
      kind: "hold_capture",
      status: capture.status,
      amountCents: finalCents,
      paypalId: capture.id,
      orderId: job.order_id,
      method: heldWith,
      note: released > 0 ? `${dollars(released)} of the hold released` : null,
    });
    return updated;
  }

  const capture = await captureAuthorization(job.authorization_id, job.fee_cents, `job-${job.id}`);
  const balance = finalCents - job.fee_cents;
  const order = await createBalanceOrder(job.id, balance, b.businessName);
  const updated = await updateJob(
    job.id,
    { status: "balance_due", final_cents: finalCents, captured_cents: job.fee_cents, balance_cents: balance, balance_order_id: order.id },
    event("captured", `Job done (${dollars(finalCents)}). Charged the ${dollars(job.fee_cents)} hold (capture ${capture.id}).`),
    event("balance_sent", `Sent a PayPal link for the ${dollars(balance)} balance, with Pay Later on eligible amounts.`),
  );
  await recordPayment(updated, {
    kind: "hold_capture",
    status: capture.status,
    amountCents: job.fee_cents,
    paypalId: capture.id,
    orderId: job.order_id,
    method: heldWith,
    note: `${dollars(balance)} balance sent to the customer`,
  });
  return updated;
}

/** The customer paid the balance above the hold (PayPal, Venmo, card or Pay Later). */
export async function confirmBalancePaid(job: Job, orderId: string): Promise<Job> {
  if (job.status === "paid") return job;
  if (!orderId || orderId !== job.balance_order_id) throw new Error("That PayPal order does not belong to this job.");
  const order = await captureOrder(orderId);
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const method = payerLabel(order);
  const updated = await updateJob(
    job.id,
    {
      status: "paid",
      captured_cents: (job.captured_cents ?? 0) + (job.balance_cents ?? 0),
      completed_at: new Date().toISOString(),
      payer_email: job.payer_email ?? order.payer?.email_address ?? null,
    },
    event("paid", `Balance paid with ${method}. Job fully paid.`),
  );
  await recordPayment(updated, {
    kind: "balance",
    status: capture?.status ?? order.status,
    amountCents: job.balance_cents ?? 0,
    paypalId: capture?.id ?? null,
    orderId,
    method,
  });
  notify(updated, "paid", `Paid in full · ${who(updated)}`, `${dollars(job.balance_cents)} balance paid with ${method}.`);
  return updated;
}

/** Release the hold. Nothing is charged. */
export async function releaseHold(job: Job, reason: string): Promise<Job> {
  if (onFile(job)) {
    if (!SECURED.has(job.status) && job.status !== "awaiting_approval") throw new Error("This job has no card on file to remove.");
    await deletePaymentToken(job.vault_id!).catch(() => {});
    const updated = await updateJob(job.id, { status: "released", vault_id: null }, event("released", `Card on file removed, nothing charged. ${reason}`));
    await recordPayment(updated, { kind: "card_removed", status: "DELETED", amountCents: 0, paypalId: job.vault_id, note: reason });
    return updated;
  }
  if (!job.authorization_id || !HELD.has(job.status)) throw new Error("There is no active hold on this job.");
  await voidAuthorization(job.authorization_id);
  const updated = await updateJob(job.id, { status: "released" }, event("released", `Hold released, nothing charged. ${reason}`));
  await recordPayment(updated, { kind: "hold_void", status: "VOIDED", amountCents: 0, paypalId: job.authorization_id, orderId: job.order_id, note: reason });
  return updated;
}

/** Cancellation policy: free before dispatch; after dispatch keep the trip fee, release the rest. */
export async function cancelVisit(job: Job, b: Business): Promise<{ job: Job; message: string }> {
  const result = await applyCancellation(job, b);
  notify(result.job, "cancelled", `Cancelled · ${who(result.job)}`, result.message);
  return result;
}

async function applyCancellation(job: Job, b: Business): Promise<{ job: Job; message: string }> {
  if (onFile(job)) {
    if (job.status === "dispatched") {
      const charge = await chargeSaved(vaultOf(job), b.tripFeeCents, job.id, `${b.businessName}: trip fee (cancelled after dispatch)`, `trip-${job.id}`);
      await deletePaymentToken(job.vault_id!).catch(() => {});
      const updated = await updateJob(
        job.id,
        { status: "cancelled_fee", captured_cents: b.tripFeeCents, final_cents: b.tripFeeCents, vault_id: null, completed_at: new Date().toISOString() },
        event("cancelled", `Cancelled after dispatch. Charged the ${dollars(b.tripFeeCents)} trip fee to the card on file (capture ${charge.captureId}).`),
      );
      await recordPayment(updated, {
        kind: "trip_fee",
        status: "COMPLETED",
        amountCents: b.tripFeeCents,
        paypalId: charge.captureId,
        orderId: charge.orderId,
        method: job.vault_type === "card" ? `Card •••• ${job.card_last4 ?? ""}`.trim() : job.vault_type === "venmo" ? "Venmo" : "PayPal",
        note: "Cancelled after dispatch",
      });
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
      { status: "cancelled_fee", captured_cents: b.tripFeeCents, final_cents: b.tripFeeCents, completed_at: new Date().toISOString() },
      event("cancelled", `Cancelled after dispatch. Kept the ${dollars(b.tripFeeCents)} trip fee (capture ${capture.id}), released the rest.`),
    );
    await recordPayment(updated, {
      kind: "trip_fee",
      status: capture.status,
      amountCents: b.tripFeeCents,
      paypalId: capture.id,
      orderId: job.order_id,
      method: job.card_last4 ? `Card •••• ${job.card_last4}` : "PayPal",
      note: `Cancelled after dispatch; ${dollars(job.fee_cents - b.tripFeeCents)} of the hold released`,
    });
    return { job: updated, message: `Cancelled. The technician was already on the way, so the ${dollars(b.tripFeeCents)} trip fee was charged and the rest of the hold released.` };
  }
  if (job.status === "hold_placed" && job.authorization_id) {
    return { job: await releaseHold(job, "Caller cancelled before dispatch."), message: "Cancelled. The hold was released and nothing was charged." };
  }
  const updated = await updateJob(job.id, { status: "released" }, event("cancelled", "Caller cancelled. No hold existed."));
  return { job: updated, message: "Cancelled. Nothing was held or charged." };
}
