import type { Business } from "./business";
import { client, dollars, ensureSchema, event, getJob, updateJob, type Job, type JobEvent } from "./db";
import { paymentsForJob, recordPayment, type Payment } from "./ledger";
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
  refundCapture,
  voidAuthorization,
  type VaultKind,
} from "./paypal";
import { tellAgent } from "./signalwire";

/**
 * Every money moment of a job, in one place. Routes (the agent's SWAIG functions, the
 * PayPal buttons, the keypad connector, the owner dashboard, the customer's approval screen,
 * PayPal webhooks) call these and nothing else. Each one updates the job, writes the payments
 * ledger and alerts the owner.
 *
 * After the job: the technician sends the final bill to the customer's screen
 * (requestApproval), the customer approves it there (approveFinalBill) and PayPal is charged
 * in the same step. Refunds draw from the PayPal captures in the ledger (refundJob).
 */

const HELD = new Set(["hold_placed", "dispatched"]);
/** The visit is secured (hold placed or card saved); the technician can be sent. */
export const SECURED = new Set(["hold_placed", "card_saved", "dispatched"]);
/** Ledger rows where money reached the business: what a refund can draw from. */
const CAPTURES = new Set(["hold_capture", "card_charge", "trip_fee", "balance"]);
/** Catches a typo before it reaches the customer's screen. */
const MAX_BILL_CENTS = 5_000_000;
const onFile = (job: Job) => job.secure_with === "card" && Boolean(job.vault_id);
const vaultOf = (job: Job) => ({ id: job.vault_id!, type: (job.vault_type ?? "card") as VaultKind });
const who = (job: Job) => job.customer_name ?? "A caller";
const where = (job: Job) => [job.service_address, job.zip && !job.service_address?.includes(job.zip) ? job.zip : null].filter(Boolean).join(" ");
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "") || null;

async function notifyAgent(job: Job, text: string) {
  if (!job.call_id) return;
  await tellAgent(job.call_id, `(Notice from the payment system, not spoken by the caller: ${text})`).catch((e) =>
    console.warn("[money] could not notify agent", e instanceof Error ? e.message : e),
  );
}

function checkAmount(cents: number) {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("Enter the final amount in dollars.");
  if (cents > MAX_BILL_CENTS) throw new Error(`That's more than ${dollars(MAX_BILL_CENTS)}. Check the amount.`);
}

/** "Visa •••• 1111" instead of PayPal's "VISA •••• 1111", without the owner's keypad note. */
export function friendlyMethod(label: string): string {
  return label
    .replace(/\s*\(keypad\)$/, "")
    .replace(/^([A-Z][A-Z_]+)(?= ••••)/, (brand) => brand.charAt(0) + brand.slice(1).toLowerCase().replace(/_/g, " "));
}

/** The saved payment method, with the card brand when PayPal told us (the card_saved ledger row). */
function savedMethod(job: Job, payments: Payment[]): string {
  if (job.vault_type === "venmo") return "Venmo";
  if (job.vault_type !== "card") return "PayPal";
  const saved = payments.findLast((p) => p.kind === "card_saved" && p.paypal_id === job.vault_id)?.method;
  return saved ? friendlyMethod(saved) : `Card •••• ${job.card_last4 ?? ""}`.trim();
}

/** What the hold is on: "PayPal", "Venmo" or "Visa •••• 1111". */
function heldMethod(job: Job, payments: Payment[]): string {
  const hold = payments.find((p) => p.kind === "hold" && p.paypal_id === job.authorization_id)?.method;
  if (hold) return friendlyMethod(hold);
  return job.card_last4 ? `Card •••• ${job.card_last4}` : "PayPal";
}

/** What secures the visit, in the customer's words: "PayPal", "Venmo", "Visa •••• 1111". */
export function securedWith(job: Job, payments: Payment[]): string {
  return onFile(job) ? savedMethod(job, payments) : heldMethod(job, payments);
}

/** The technician's one-line description of the work, saved with the approval request. */
export function workDescription(job: Pick<Job, "approval_evidence">): string | null {
  return oneLine((job.approval_evidence as { description?: unknown } | null)?.description, 140);
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
  // Keep the estimate the agent worked out for this caller (or the tech confirmed); else the owner's default.
  const eta = job.eta ?? b.eta;
  const updated = await updateJob(
    job.id,
    { status: "dispatched", tech_name: b.technician, eta },
    event("dispatched", `${b.technician} dispatched, arriving in ${eta}`),
  );
  notify(updated, "dispatched", `${b.technician} dispatched · ${who(updated)}`, [`Arriving in ${eta}`, where(updated), updated.issue].filter(Boolean).join(" · "));
  return updated;
}

export async function bookMorning(job: Job, b: Business): Promise<Job> {
  const updated = await updateJob(job.id, { status: "scheduled", eta: b.morningSlot }, event("scheduled", `No hold. Booked ${b.morningSlot}`));
  notify(updated, "booked", `Booked ${b.morningSlot} · ${who(updated)}`, [updated.issue, updated.callback_phone].filter(Boolean).join(" · "));
  return updated;
}

/* ------------------------------------------------------------------------------------------
 * The final bill: the technician sends it, the customer approves it on their own screen.
 * ---------------------------------------------------------------------------------------- */

/**
 * On site, the job is done: put the final bill on the customer's screen (/pay/[id]).
 * Nothing is charged until they approve. Sending it again replaces the amount.
 */
export async function requestApproval(job: Job, finalCents: number, description?: string | null): Promise<Job> {
  checkAmount(finalCents);
  if (job.approved_at) throw new Error("The customer already approved the final bill.");
  const card = onFile(job);
  if (card) {
    if (!SECURED.has(job.status) && job.status !== "awaiting_approval") throw new Error("This job has no card on file to charge.");
  } else if (!job.authorization_id || !HELD.has(job.status)) {
    throw new Error("There's no active hold on this job.");
  }
  const work = oneLine(description, 140);
  const now = new Date().toISOString();
  const bill = `${job.approval_requested_at ? "a new final bill" : "the final bill"} of ${dollars(finalCents)}`;
  return updateJob(
    job.id,
    {
      approval_cents: finalCents,
      approval_requested_at: now,
      approved_at: null,
      approval_evidence: { description: work, requested_at: now },
      // A hold job keeps its status: the hold stays usable for "Charge from hold" and the cancellation fee.
      ...(card ? { status: "awaiting_approval" as const } : {}),
    },
    event("approval_requested", `Sent ${job.customer_name ?? "the customer"} ${bill} to approve${work ? `: ${work}` : ""}.`),
  );
}

export type ApprovalMode = "hold_within" | "hold_over" | "card";

/** What the customer sees on their screen and approves. Built here, shown as is, and saved as the evidence. */
export type ApprovalSummary = {
  business: string;
  customer: string | null;
  tech: string | null;
  address: string | null;
  /** The technician's one-line description of the work. */
  work: string | null;
  /** What the caller reported on the phone. */
  issue: string | null;
  mode: ApprovalMode;
  finalCents: number;
  holdCents: number;
  /** Paid right after approving (hold_over). */
  balanceCents: number;
  /** Released back to the customer (hold_within). */
  releasedCents: number;
  /** The hold or the saved method: "PayPal", "Visa •••• 1111". */
  method: string;
  headline: string;
  detail: string;
  button: string;
  requestedAt: string;
};

/** The final bill waiting for the customer's approval, or null when there's nothing to approve. */
export async function approvalSummary(job: Job, b: Business, payments?: Payment[]): Promise<ApprovalSummary | null> {
  if (!job.approval_cents || !job.approval_requested_at || job.approved_at) return null;
  const card = onFile(job);
  if (card ? !SECURED.has(job.status) && job.status !== "awaiting_approval" : !job.authorization_id || !HELD.has(job.status)) return null;
  const rows = payments ?? (await paymentsForJob(job.id).catch(() => [] as Payment[]));
  const final = job.approval_cents;
  const hold = card ? 0 : job.fee_cents;
  const mode: ApprovalMode = card ? "card" : final <= hold ? "hold_within" : "hold_over";
  const method = card ? savedMethod(job, rows) : heldMethod(job, rows);
  const released = mode === "hold_within" ? hold - final : 0;
  const balance = mode === "hold_over" ? final - hold : 0;
  const onFileWith = job.vault_type === "card" ? `to ${method} on file` : `with your ${method} account on file`;
  return {
    business: b.businessName,
    customer: job.customer_name,
    tech: job.tech_name,
    address: where(job) || null,
    work: workDescription(job),
    issue: job.issue,
    mode,
    finalCents: final,
    holdCents: hold,
    balanceCents: balance,
    releasedCents: released,
    method,
    headline: mode === "card" ? `Approve ${dollars(final)} ${onFileWith}` : `Approve ${dollars(final)}`,
    detail:
      mode === "card"
        ? "Nothing is charged until you tap Approve."
        : mode === "hold_within"
          ? released > 0
            ? `It comes out of your ${dollars(hold)} hold and the other ${dollars(released)} is released.`
            : `It comes out of your ${dollars(hold)} hold.`
          : `Your ${dollars(hold)} hold is applied and you pay the ${dollars(balance)} balance right here with PayPal, Venmo, card or Pay Later.`,
    button: `Approve ${dollars(final)}`,
    requestedAt: job.approval_requested_at,
  };
}

/** The customer's screen showed an amount that is no longer the bill (or the bill was already handled). */
export class BillChanged extends Error {}

export type ApprovalDevice = { ip: string | null; userAgent: string | null; via: "link" | "handoff" };

/** Only one approval wins, even if the customer taps twice or opens the page on two phones. */
async function claimApproval(jobId: string, cents: number, at: string, evidence: Record<string, unknown>, e: JobEvent): Promise<Job | null> {
  await ensureSchema();
  const rows = (await client().query(
    `UPDATE jobs SET approved_at = $1, approval_evidence = $2::jsonb, events = events || $3::jsonb, updated_at = now()
     WHERE id = $4 AND approved_at IS NULL AND approval_cents = $5 RETURNING *`,
    [at, JSON.stringify(evidence), JSON.stringify([e]), jobId, cents],
  )) as Job[];
  return rows[0] ?? null;
}

/**
 * The customer tapped Approve on their own screen (or on the technician's phone). Save the
 * approval with the amount, time, IP and device, then charge through PayPal in the same step:
 * from the hold (the rest released), the hold plus a balance order they pay right there, or
 * the card on file. If PayPal refuses, the approval is undone so they can try again.
 */
export async function approveFinalBill(job: Job, b: Business, amountCents: number, device: ApprovalDevice): Promise<Job> {
  const bill = await approvalSummary(job, b);
  if (!bill) {
    if (job.approved_at) return job;
    throw new BillChanged("There's no bill waiting for your approval.");
  }
  if (amountCents !== bill.finalCents) throw new BillChanged(`The bill changed to ${dollars(bill.finalCents)}. Check it and approve again.`);
  const at = new Date().toISOString();
  const evidence = {
    amount_cents: bill.finalCents,
    description: bill.work,
    terms: `${bill.headline}. ${bill.detail}`,
    method: bill.method,
    requested_at: bill.requestedAt,
    approved_at: at,
    ip: device.ip,
    user_agent: device.userAgent,
    via: device.via,
  };
  const name = job.customer_name ?? "The customer";
  const claimed = await claimApproval(
    job.id,
    bill.finalCents,
    at,
    evidence,
    event("approved", `${name} approved the ${dollars(bill.finalCents)} final bill ${device.via === "handoff" ? "on the technician's phone" : "on their own device"}.`),
  );
  if (!claimed) {
    const fresh = await getJob(job.id);
    if (fresh?.approved_at) return fresh;
    throw new BillChanged("The bill changed. Reload to see the new amount.");
  }
  try {
    return await completeJob(claimed, b, bill.finalCents);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "PayPal error";
    await updateJob(job.id, { approved_at: null }, event("approval_failed", `${name} approved, but PayPal didn't take the payment: ${reason}`)).catch(() => {});
    throw e;
  }
}

/**
 * Charge the final bill:
 *  - card on file: only the amount the customer approved on their screen
 *  - final ≤ hold: capture the final amount, the rest of the hold is released (the owner can
 *    do this without asking again: the customer authorized that much on the call)
 *  - final > hold: only after the customer's approval; open the balance order first, then
 *    capture the whole hold. The customer pays the balance right there (Pay Later eligible).
 */
export async function completeJob(job: Job, b: Business, finalCents: number): Promise<Job> {
  checkAmount(finalCents);
  const now = new Date().toISOString();
  const approved = Boolean(job.approved_at) && job.approval_cents === finalCents;
  const by = approved ? `, approved by ${job.customer_name ?? "the customer"}` : "";
  const work = workDescription(job);

  if (onFile(job)) {
    if (!approved) throw new Error("A card on file is charged only after the customer approves the final bill on their screen. Tap Get customer approval.");
    if (!SECURED.has(job.status) && job.status !== "awaiting_approval") throw new Error("This job has nothing left to charge.");
    const method = savedMethod(job, await paymentsForJob(job.id).catch(() => [] as Payment[]));
    const charge = await chargeSaved(vaultOf(job), finalCents, job.id, `${b.businessName}: ${work ?? "repair, parts and labor"}`, `final-${job.id}-${finalCents}`);
    const updated = await updateJob(
      job.id,
      { status: "paid", final_cents: finalCents, captured_cents: finalCents, balance_cents: 0, balance_order_id: charge.orderId, completed_at: now },
      event("charged", `Job done. Charged ${dollars(finalCents)} to ${method} on file${by} (capture ${charge.captureId}).`),
    );
    await recordPayment(updated, {
      kind: "card_charge",
      status: "COMPLETED",
      amountCents: finalCents,
      paypalId: charge.captureId,
      orderId: charge.orderId,
      method,
      note: work ? `Final bill: ${work}` : "Final bill, card on file",
    });
    notify(updated, "paid", `Paid ${dollars(finalCents)} · ${who(updated)}`, `Charged to ${method} on file after the customer approved the bill.`);
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
      event("captured", `Job done. Charged ${dollars(finalCents)} from the hold${by} (capture ${capture.id})${released > 0 ? `, released ${dollars(released)}` : ""}.`),
    );
    await recordPayment(updated, {
      kind: "hold_capture",
      status: capture.status,
      amountCents: finalCents,
      paypalId: capture.id,
      orderId: job.order_id,
      method: heldWith,
      note: [work ? `Final bill: ${work}` : null, released > 0 ? `${dollars(released)} of the hold released` : null].filter(Boolean).join(". ") || null,
    });
    notify(
      updated,
      "paid",
      `Paid ${dollars(finalCents)} · ${who(updated)}`,
      `From the ${dollars(job.fee_cents)} hold${released > 0 ? `, ${dollars(released)} released` : ""}${approved ? ", approved by the customer" : ""}.`,
    );
    return updated;
  }

  if (!approved) throw new Error(`A bill above the ${dollars(job.fee_cents)} hold needs the customer's approval. Tap Get customer approval.`);
  const balance = finalCents - job.fee_cents;
  // The balance order first: if PayPal can't open it, nothing has been charged yet.
  const order = await createBalanceOrder(job.id, balance, b.businessName);
  const capture = await captureAuthorization(job.authorization_id, job.fee_cents, `job-${job.id}`);
  const updated = await updateJob(
    job.id,
    { status: "balance_due", final_cents: finalCents, captured_cents: job.fee_cents, balance_cents: balance, balance_order_id: order.id },
    event("captured", `Job done (${dollars(finalCents)}${by}). Charged the ${dollars(job.fee_cents)} hold (capture ${capture.id}).`),
    event("balance_sent", `The customer pays the ${dollars(balance)} balance on their screen with PayPal, Venmo, card or Pay Later.`),
  );
  await recordPayment(updated, {
    kind: "hold_capture",
    status: capture.status,
    amountCents: job.fee_cents,
    paypalId: capture.id,
    orderId: job.order_id,
    method: heldWith,
    note: [work ? `Final bill: ${work}` : null, `${dollars(balance)} balance paid separately`].filter(Boolean).join(". "),
  });
  notify(updated, "approved", `Bill approved · ${who(updated)}`, `${dollars(finalCents)} approved. ${dollars(job.fee_cents)} hold charged, ${dollars(balance)} balance being paid with PayPal.`);
  return updated;
}

/** The owner's shortcut for a bill the hold already covers: no second approval needed. */
export async function chargeFromHold(job: Job, b: Business, finalCents: number): Promise<Job> {
  checkAmount(finalCents);
  if (onFile(job)) throw new Error("A card on file is charged only after the customer approves the final bill. Tap Get customer approval.");
  if (finalCents > job.fee_cents) throw new Error(`A bill above the ${dollars(job.fee_cents)} hold needs the customer's approval. Tap Get customer approval.`);
  return completeJob(job, b, finalCents);
}

/** The customer paid the balance above the hold (PayPal, Venmo, card or Pay Later). */
export async function confirmBalancePaid(job: Job, orderId: string): Promise<Job> {
  if (job.status === "paid") return job;
  if (job.status !== "balance_due") throw new Error("There's no balance to pay on this job.");
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

/* ------------------------------------------------------------------------------------------
 * Refunds
 * ---------------------------------------------------------------------------------------- */

/** Adds to the refunded total in one statement, so a webhook recording another refund can't be lost. */
async function addRefunded(jobId: string, cents: number): Promise<Job> {
  await ensureSchema();
  const rows = (await client().query(`UPDATE jobs SET refunded_cents = refunded_cents + $1, updated_at = now() WHERE id = $2 RETURNING *`, [cents, jobId])) as Job[];
  if (!rows[0]) throw new Error(`Job ${jobId} not found`);
  return rows[0];
}

/**
 * Give money back, in full (cents = null) or in part, newest payment first: a balance payment
 * before the hold it followed. Each PayPal refund is written to the ledger against the order
 * it came from; the job's refunded total moves only when this call wrote that row (PayPal's
 * webhook may have recorded the same refund first). Everything back → status "refunded".
 */
export async function refundJob(job: Job, b: Business, cents: number | null, reason?: string | null): Promise<Job> {
  const left = job.captured_cents - job.refunded_cents;
  if (left <= 0) throw new Error("There's nothing left to refund on this job.");
  const want = cents ?? left;
  if (!Number.isInteger(want) || want <= 0) throw new Error("Enter the amount to refund.");
  if (want > left) throw new Error(`You can refund up to ${dollars(left)}.`);
  const why = oneLine(reason, 120);

  const payments = await paymentsForJob(job.id);
  const refunds = payments.filter((p) => p.kind === "refund");
  const captures = payments.filter((p) => CAPTURES.has(p.kind) && p.paypal_id && p.amount_cents > 0).reverse();
  if (!captures.length) throw new Error("PayPal has no payment on this job to refund.");

  let remaining = want;
  let current = job;
  const done: { cents: number; method: string; id: string }[] = [];
  let failure: string | null = null;
  for (const c of captures) {
    if (remaining <= 0) break;
    const already = refunds.filter((r) => r.paypal_order_id && r.paypal_order_id === c.paypal_order_id).reduce((s, r) => s + r.amount_cents, 0);
    const room = c.amount_cents - already;
    if (room <= 0) continue;
    const amount = Math.min(remaining, room);
    try {
      // Same click retried → same key → PayPal returns the same refund instead of a second one.
      const refund = await refundCapture(c.paypal_id!, amount, `refund-${c.paypal_id}-${current.refunded_cents}-${already}-${amount}`, why ?? `Refund from ${b.businessName}`);
      if (refund.status === "FAILED" || refund.status === "CANCELLED") throw new Error(`PayPal ${refund.status.toLowerCase()} the refund.`);
      const method = c.method ?? "PayPal";
      const fresh = await recordPayment(job, {
        kind: "refund",
        status: refund.status,
        amountCents: amount,
        paypalId: refund.id,
        orderId: c.paypal_order_id,
        method,
        note: why ?? (amount + already < c.amount_cents ? "Partial refund" : already > 0 ? "Rest of the payment refunded" : "Full refund"),
      });
      current = fresh ? await addRefunded(job.id, amount) : ((await getJob(job.id)) ?? current);
      done.push({ cents: amount, method, id: refund.id });
      remaining -= amount;
    } catch (e) {
      failure = e instanceof Error ? e.message : "PayPal error";
      break;
    }
  }

  if (!done.length) throw new Error(failure ?? "PayPal has no payment left to refund on this job.");
  const total = done.reduce((s, d) => s + d.cents, 0);
  const full = current.refunded_cents >= current.captured_cents;
  const methods = [...new Set(done.map((d) => friendlyMethod(d.method)))].join(" and ");
  const updated = await updateJob(
    job.id,
    full ? { status: "refunded" } : {},
    event("refunded", `Refunded ${dollars(total)} to ${methods}${why ? ` (${why})` : ""}. PayPal refund ${done.map((d) => d.id).join(", ")}.${full ? " Everything collected is refunded." : ""}`),
  );
  notify(
    updated,
    "refunded",
    `Refunded ${dollars(total)} · ${who(updated)}`,
    full ? `Everything collected went back to ${methods}.` : `${dollars(updated.captured_cents - updated.refunded_cents)} kept. ${why ?? ""}`.trim(),
  );
  if (failure) throw new Error(`Refunded ${dollars(total)}, but PayPal stopped the other ${dollars(want - total)}: ${failure}`);
  return updated;
}

/* ------------------------------------------------------------------------------------------
 * Releases and cancellations
 * ---------------------------------------------------------------------------------------- */

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
  // While the agent is still phoning the technician, nobody has headed out yet, so no trip fee.
  const rolling = job.status === "dispatched" && job.tech_status !== "calling";
  const stillCallingTech = job.status === "dispatched" && job.tech_status === "calling";
  if (onFile(job)) {
    // Waiting on the final bill means the technician came out, unless he was never dispatched.
    const sent = rolling || (job.status === "awaiting_approval" && Boolean(job.tech_name));
    if (sent) {
      const charge = await chargeSaved(vaultOf(job), b.tripFeeCents, job.id, `${b.businessName}: trip fee (cancelled after dispatch)`, `trip-${job.id}`);
      await deletePaymentToken(job.vault_id!).catch(() => {});
      const method = savedMethod(job, await paymentsForJob(job.id).catch(() => [] as Payment[]));
      const updated = await updateJob(
        job.id,
        { status: "cancelled_fee", captured_cents: b.tripFeeCents, final_cents: b.tripFeeCents, vault_id: null, completed_at: new Date().toISOString() },
        event("cancelled", `Cancelled after dispatch. Charged the ${dollars(b.tripFeeCents)} trip fee to ${method} on file (capture ${charge.captureId}).`),
      );
      await recordPayment(updated, {
        kind: "trip_fee",
        status: "COMPLETED",
        amountCents: b.tripFeeCents,
        paypalId: charge.captureId,
        orderId: charge.orderId,
        method,
        note: "Cancelled after dispatch",
      });
      return { job: updated, message: `Cancelled. The technician was already on the way, so the ${dollars(b.tripFeeCents)} trip fee was charged to the card on file.` };
    }
    if (job.status === "card_saved" || job.status === "awaiting_approval" || stillCallingTech) {
      return { job: await releaseHold(job, "Caller cancelled before dispatch."), message: "Cancelled. Nothing was charged and the card was removed." };
    }
  }
  if (rolling && job.authorization_id) {
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
  if ((job.status === "hold_placed" || stillCallingTech) && job.authorization_id) {
    return { job: await releaseHold(job, "Caller cancelled before dispatch."), message: "Cancelled. The hold was released and nothing was charged." };
  }
  const updated = await updateJob(job.id, { status: "released" }, event("cancelled", "Caller cancelled. No hold existed."));
  return { job: updated, message: "Cancelled. Nothing was held or charged." };
}
