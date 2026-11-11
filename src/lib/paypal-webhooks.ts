import { client, ensureSchema, event, getJob, updateJob, type Job } from "./db";
import { env } from "./env";
import { dollars } from "./format";
import { paymentsForJob, recordPayment, type PaymentInput, type PaymentKind } from "./ledger";
import { confirmBalancePaid, confirmPayPalHold } from "./money";
import { notify } from "./notify";
import { accessToken, getOrder, payerLabel, PayPalError, pp } from "./paypal";

/**
 * PayPal webhooks: PayPal's own record of every money moment. They keep a job right when the
 * browser doesn't finish (the caller approves the hold and closes the tab, the customer pays the
 * balance and closes the page) and when money moves in PayPal itself (a refund or chargeback, a
 * hold voided or expired, a saved card deleted).
 *
 *   POST /api/paypal/webhook → verifyWebhook() with PayPal → 200 → handlePayPalEvent() after the response
 *
 * Each event is handled once (the paypal_events table), and a few seconds late on purpose: the
 * browser reports the same moment within a second or two, and money.ts then sees the work is
 * done, so Ava never announces twice. Every step is safe to repeat: money.ts skips finished work,
 * PayPal-Request-Id makes PayPal calls idempotent, and the ledger is unique per PayPal id.
 *
 * Docs: https://developer.paypal.com/api/rest/webhooks/ and https://developer.paypal.com/docs/api/webhooks/v1/
 */

type Money = { currency_code?: string; value?: string };

/** What we read from an event's resource: an order, authorization, capture, refund or vault payment token. */
export type WebhookResource = {
  id?: string;
  status?: string;
  intent?: string;
  custom_id?: string;
  invoice_id?: string;
  amount?: Money;
  expiration_time?: string;
  purchase_units?: { reference_id?: string; custom_id?: string }[];
  supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string; capture_id?: string } };
  payment_source?: { card?: { brand?: string; last_digits?: string }; paypal?: object; venmo?: object };
  links?: { href?: string; rel?: string }[];
};

export type PayPalWebhookEvent = {
  id: string;
  event_type: string;
  resource_type?: string;
  create_time?: string;
  summary?: string;
  resource?: WebhookResource;
};

/** The body, if it is shaped like a PayPal webhook event. */
export function parseWebhookEvent(raw: string): PayPalWebhookEvent | null {
  try {
    const e = JSON.parse(raw) as Partial<PayPalWebhookEvent> | null;
    if (!e || typeof e !== "object" || Array.isArray(e)) return null;
    return typeof e.id === "string" && typeof e.event_type === "string" ? (e as PayPalWebhookEvent) : null;
  } catch {
    return null;
  }
}

/** The PayPal app's webhooks by URL, and when we last asked PayPal for them. */
let registered: { at: number; ids: Map<string, string> } | null = null;
let asking: Promise<Map<string, string>> | null = null;
const ASK_EVERY_MS = 60_000;

/**
 * The id of the webhook PayPal signs this deployment's events for: PAYPAL_WEBHOOK_ID when set,
 * else the PayPal app's webhook for this exact URL (scripts/register-paypal-webhook.mjs registers
 * it), so a deployment needs no extra env var. Kept in memory; a URL that isn't registered is
 * looked up again at most once a minute. Null when PayPal has no webhook for the URL.
 */
export async function webhookIdFor(url: string): Promise<string | null> {
  if (process.env.PAYPAL_WEBHOOK_ID) return process.env.PAYPAL_WEBHOOK_ID;
  const known = registered?.ids.get(url);
  if (known) return known;
  if (registered && Date.now() - registered.at < ASK_EVERY_MS) return null;
  asking ??= pp<{ webhooks?: { id: string; url: string }[] }>("/v1/notifications/webhooks")
    .then(({ webhooks = [] }) => {
      registered = { at: Date.now(), ids: new Map(webhooks.map((w) => [w.url, w.id])) };
      return registered.ids;
    })
    .finally(() => {
      asking = null;
    });
  return (await asking).get(url) ?? null;
}

const SIGNATURE_HEADERS = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];

/**
 * Asks PayPal whether it sent this exact event (POST /v1/notifications/verify-webhook-signature).
 * The body goes back byte for byte as webhook_event: the signature covers those bytes, and parsing
 * and re-serializing can change them. "unavailable" means PayPal couldn't answer (PayPal retries).
 */
export async function verifyWebhook(headers: Headers, rawBody: string, webhookId: string): Promise<"verified" | "rejected" | "unavailable"> {
  const [auth_algo, cert_url, transmission_id, transmission_sig, transmission_time] = SIGNATURE_HEADERS.map((h) => headers.get(h));
  if (!auth_algo || !cert_url || !transmission_id || !transmission_sig || !transmission_time) return "rejected";
  const fields = JSON.stringify({ auth_algo, cert_url, transmission_id, transmission_sig, transmission_time, webhook_id: webhookId });
  try {
    const res = await fetch(`${env.paypal.base}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: `${fields.slice(0, -1)},"webhook_event":${rawBody}}`,
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { verification_status?: string; name?: string; debug_id?: string };
    if (res.ok) return body.verification_status === "SUCCESS" ? "verified" : "rejected";
    console.warn("[paypal webhook] verify-webhook-signature", res.status, body.name ?? "", body.debug_id ?? "");
    return res.status >= 500 || res.status === 429 ? "unavailable" : "rejected";
  } catch (e) {
    console.warn("[paypal webhook] could not reach PayPal to verify", e instanceof Error ? e.message : e);
    return "unavailable";
  }
}

let logReady: Promise<void> | null = null;

function ensureEventLog(): Promise<void> {
  logReady ??= (async () => {
    const sql = client();
    await sql.query(`
      CREATE TABLE IF NOT EXISTS paypal_events (
        id text PRIMARY KEY,
        event_type text NOT NULL,
        resource_id text,
        job_id uuid,
        received_at timestamptz NOT NULL DEFAULT now()
      )`);
    await sql.query(`CREATE INDEX IF NOT EXISTS paypal_events_job ON paypal_events (job_id)`);
  })().catch((e) => {
    logReady = null;
    throw e;
  });
  return logReady;
}

/** Remembers the event; false when it was already handled (PayPal retries, and sometimes sends twice). */
async function claim(e: PayPalWebhookEvent): Promise<boolean> {
  await ensureEventLog();
  const rows = await client().query(
    `INSERT INTO paypal_events (id, event_type, resource_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [e.id, e.event_type, e.resource?.id ?? null],
  );
  return rows.length > 0;
}

/** Long enough for the browser to finish the same moment first. */
const GRACE_MS = 8_000;
/** The note on ledger rows written here. */
const FROM_WEBHOOK = "From PayPal's webhook";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Moment = { job: Job; r: WebhookResource; e: PayPalWebhookEvent; graceMs: number };

const HANDLERS: Record<string, (m: Moment) => Promise<string>> = {
  "CHECKOUT.ORDER.APPROVED": orderApproved,
  "PAYMENT.AUTHORIZATION.CREATED": authorizationCreated,
  "PAYMENT.AUTHORIZATION.VOIDED": authorizationVoided,
  "PAYMENT.CAPTURE.COMPLETED": captureCompleted,
  "PAYMENT.CAPTURE.REFUNDED": moneyReturned,
  "PAYMENT.CAPTURE.REVERSED": moneyReturned,
  "PAYMENT.CAPTURE.DENIED": moneyReturned,
  "VAULT.PAYMENT-TOKEN.CREATED": tokenCreated,
  "VAULT.PAYMENT-TOKEN.DELETED": tokenDeleted,
};

/**
 * Handles one verified event and says what it did (for the logs). It's a plain function so it can
 * be exercised without a delivery from PayPal; the route calls it after answering.
 */
export async function handlePayPalEvent(e: PayPalWebhookEvent, { graceMs = GRACE_MS }: { graceMs?: number } = {}): Promise<string> {
  const handle = HANDLERS[e.event_type];
  if (!handle) return "ignored: not an event Call Captain uses";
  if (!(await claim(e))) return "duplicate: already handled";
  await sleep(graceMs);
  const r = e.resource ?? {};
  for (let attempt = 1; ; attempt++) {
    try {
      const job = await findJob(r);
      if (!job) return "no Call Captain job for this resource";
      await client().query(`UPDATE paypal_events SET job_id = $2 WHERE id = $1`, [e.id, job.id]);
      return await handle({ job, r, e, graceMs });
    } catch (err) {
      // Network, database and PayPal 5xx hiccups: try again, since every step is safe to repeat.
      if (attempt === 3 || (err instanceof PayPalError && err.status < 500 && err.status !== 429)) throw err;
      await sleep(attempt * 2_000);
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((id): id is string => Boolean(id)))];
const lastSegment = (href?: string) => href?.split("?")[0].split("/").filter(Boolean).pop();

/** The object this one belongs to ("up"): a refund's capture, a capture's authorization or order. */
function parentOf(r: WebhookResource, collection: "captures" | "authorizations" | "orders"): string | undefined {
  return lastSegment(r.links?.find((l) => l.rel === "up" && l.href?.includes(`/${collection}/`))?.href);
}

const orderOf = (r: WebhookResource) => r.supplementary_data?.related_ids?.order_id ?? parentOf(r, "orders");

/**
 * Which job an event is about: the job id PayPal echoes back (custom_id, or a purchase unit's
 * custom_id / reference_id), else the job holding one of the PayPal ids, else the ledger. A refund
 * only names its capture, so as a last resort we ask PayPal for that capture.
 */
async function findJob(r: WebhookResource, lookUpCapture = true): Promise<Job | null> {
  const units = r.purchase_units ?? [];
  const jobIds = unique([r.custom_id, ...units.flatMap((u) => [u.custom_id, u.reference_id?.replace(/-balance$/, "")])]);
  for (const id of jobIds.filter((id) => UUID.test(id))) {
    const job = await getJob(id);
    if (job) return job;
  }
  const related = r.supplementary_data?.related_ids;
  const ids = unique([r.id, related?.order_id, related?.authorization_id, related?.capture_id, ...(r.links ?? []).filter((l) => l.rel === "up").map((l) => lastSegment(l.href))]);
  if (ids.length) {
    await ensureSchema();
    const [job] = (await client().query(
      `SELECT * FROM jobs
       WHERE order_id = ANY($1::text[]) OR authorization_id = ANY($1::text[]) OR balance_order_id = ANY($1::text[]) OR vault_id = ANY($1::text[])
       ORDER BY created_at DESC LIMIT 1`,
      [ids],
    )) as Job[];
    if (job) return job;
    const jobId = await ledgerJobFor(ids);
    if (jobId) return getJob(jobId);
  }
  const capture = parentOf(r, "captures");
  if (!lookUpCapture || !capture) return null;
  const parent = await pp<WebhookResource>(`/v2/payments/captures/${capture}`).catch((err) => {
    if (err instanceof PayPalError && err.status === 404) return null;
    throw err;
  });
  return parent ? findJob(parent, false) : null;
}

/** The job behind a ledger row for any of these PayPal ids (a vault token outlives the job's vault_id). */
async function ledgerJobFor(ids: string[]): Promise<string | null> {
  try {
    const rows = (await client().query(`SELECT job_id FROM payments WHERE paypal_id = ANY($1::text[]) OR paypal_order_id = ANY($1::text[]) LIMIT 1`, [
      ids,
    ])) as { job_id: string }[];
    return rows[0]?.job_id ?? null;
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") return null; // nothing recorded on this database yet
    throw err;
  }
}

/** CHECKOUT.ORDER.APPROVED: the caller approved the hold, or the customer approved the balance, in PayPal. */
async function orderApproved({ job, r, graceMs }: Moment): Promise<string> {
  const orderId = r.id;
  if (!orderId) return "no order id";

  if (orderId === job.order_id) {
    // Still waiting on this hold, or the call ended first (the caller closed the tab after approving).
    const waiting = (j: Job) => j.order_id === orderId && !j.authorization_id && (j.status === "awaiting_hold" || j.status === "ended");
    const current = await stillToDo(job, orderId, waiting, graceMs);
    if (!current) return "nothing to do: the hold was already placed or the job moved on";
    const ended = current.status === "ended";
    const held = await confirmPayPalHold(current, orderId);
    await updateJob(
      held.id,
      {},
      event(
        "paypal_webhook",
        ended
          ? "Placed from PayPal's notice: the caller approved the hold, then the call ended before their screen confirmed it. Call them back to dispatch."
          : "Placed from PayPal's notice: the caller approved in PayPal, but their screen didn't confirm it.",
      ),
    );
    if (ended) {
      notify(held, "follow_up", `Hold placed after the call · ${who(held)}`, `They approved the ${dollars(held.fee_cents)} hold, then hung up before it finished. Call them back to dispatch.`);
    }
    return ended ? "hold placed after the call ended" : "hold placed";
  }

  if (orderId === job.balance_order_id) {
    const current = await stillToDo(job, orderId, (j) => j.balance_order_id === orderId && j.status === "balance_due", graceMs);
    if (!current) return "nothing to do: the balance was already paid";
    const paid = await confirmBalancePaid(current, orderId);
    await updateJob(paid.id, {}, event("paypal_webhook", "Confirmed from PayPal's notice: the customer approved the payment, but their page closed before it finished."));
    return "balance captured";
  }

  return "not this job's hold or balance order";
}

/**
 * The job, if it still needs this order finished. If PayPal already shows the order authorized or
 * captured, the browser did it and its database write is landing: wait once more, and only if the
 * job still hasn't moved finish it here (PayPal-Request-Id returns the browser's result again).
 */
async function stillToDo(job: Job, orderId: string, waiting: (j: Job) => boolean, graceMs: number): Promise<Job | null> {
  if (!waiting(job)) return null;
  const { status } = await getOrder(orderId);
  if (status === "APPROVED") return job;
  if (status !== "COMPLETED") return null;
  await sleep(graceMs);
  const fresh = await getJob(job.id);
  return fresh && waiting(fresh) ? fresh : null;
}

/** PAYMENT.AUTHORIZATION.CREATED: make sure the ledger has the hold. */
async function authorizationCreated({ job, r }: Moment): Promise<string> {
  if (!r.id) return "no authorization id";
  if (await inLedger(job, ["hold"], r.id)) return "ledger already had the hold";
  const orderId = orderOf(r) ?? job.order_id;
  await ensurePayment(job, {
    kind: "hold",
    status: r.status ?? "CREATED",
    amountCents: cents(r.amount) ?? job.fee_cents,
    paypalId: r.id,
    orderId,
    method: (orderId ? await orderLabel(orderId) : null) ?? holdLabel(job),
    note: FROM_WEBHOOK,
  });
  return "hold added to the ledger";
}

const HOLD_ACTIVE = new Set(["hold_placed", "dispatched", "awaiting_approval"]);

/** PAYMENT.AUTHORIZATION.VOIDED: voided in PayPal, or expired after 29 days, while the job still counted on it. */
async function authorizationVoided({ job, r }: Moment): Promise<string> {
  if (!r.id || r.id !== job.authorization_id || !HOLD_ACTIVE.has(job.status)) return "nothing to do: the hold was already settled";
  const expired = r.status === "EXPIRED" || (r.expiration_time ? Date.parse(r.expiration_time) <= Date.now() : false);
  const what = `The ${dollars(cents(r.amount) ?? job.fee_cents)} hold ${expired ? "expired at PayPal (holds last 29 days)" : "was voided in PayPal"}`;
  const enRoute = job.status === "dispatched" ? `${job.tech_name ?? "The technician"} was already dispatched` : null;
  await ensurePayment(job, { kind: "hold_void", status: r.status ?? "VOIDED", amountCents: 0, paypalId: r.id, orderId: job.order_id, note: expired ? "Expired at PayPal" : "Voided in PayPal" });
  const updated = await updateJob(job.id, { status: "released" }, event("released", `${what}. Nothing was charged.${enRoute ? ` ${enRoute}: collect payment on site.` : ""}`));
  notify(updated, "follow_up", `Hold ${expired ? "expired" : "voided"} · ${who(updated)}`, `${what}, so this visit isn't covered any more.${enRoute ? ` ${enRoute}.` : ""}`);
  return expired ? "expired hold released" : "voided hold released";
}

const CAPTURE_KINDS: PaymentKind[] = ["hold_capture", "trip_fee", "card_charge", "balance"];

/** PAYMENT.CAPTURE.COMPLETED: make sure the ledger has the charge. */
async function captureCompleted({ job, r }: Moment): Promise<string> {
  if (!r.id) return "no capture id";
  const paidFor = captureContext(job, r);
  if (!paidFor) return "not a charge Call Captain made";
  if (await inLedger(job, CAPTURE_KINDS, r.id)) return `ledger already had the ${paidFor.kind}`;
  const orderId = orderOf(r) ?? (paidFor.from === "hold" ? job.order_id : job.balance_order_id);
  const method =
    paidFor.from === "hold" ? holdLabel(job) : paidFor.from === "saved" ? savedLabel(job) : ((orderId ? await orderLabel(orderId) : null) ?? "PayPal");
  await ensurePayment(job, { kind: paidFor.kind, status: r.status ?? "COMPLETED", amountCents: cents(r.amount) ?? 0, paypalId: r.id, orderId, method, note: FROM_WEBHOOK });
  return `${paidFor.kind} added to the ledger`;
}

/** What a capture paid for: the invoice_id money.ts gave it, else the authorization or order it came from. */
function captureContext(job: Job, r: WebhookResource): { kind: PaymentKind; from: "hold" | "saved" | "order" } | null {
  const invoice = r.invoice_id ?? "";
  if (invoice === `job-${job.id}`) return { kind: "hold_capture", from: "hold" };
  if (invoice === `job-${job.id}-trip`) return { kind: "trip_fee", from: "hold" };
  if (invoice === `trip-${job.id}`) return { kind: "trip_fee", from: "saved" };
  // The card-on-file final bill: final-<job>-<cents> (final-<job> before the bill carried its amount).
  if (invoice === `final-${job.id}` || invoice.startsWith(`final-${job.id}-`)) return { kind: "card_charge", from: "saved" };
  const authorizationId = r.supplementary_data?.related_ids?.authorization_id ?? parentOf(r, "authorizations");
  if (authorizationId && authorizationId === job.authorization_id) return { kind: "hold_capture", from: "hold" };
  const orderId = orderOf(r);
  if (orderId && orderId === job.balance_order_id) return job.hold_method === "vault" ? { kind: "card_charge", from: "saved" } : { kind: "balance", from: "order" };
  return null;
}

type Returned = "refunded" | "reversed" | "denied";

/**
 * PAYMENT.CAPTURE.REFUNDED / REVERSED / DENIED: money that went back to the customer (a refund, a
 * chargeback) or never arrived (a denied capture). Same conventions as refundJob in money.ts, so
 * the two never count a refund twice: the ledger row carries the refund id and the order of the
 * payment it came out of, and the total moves only when this call wrote that row.
 */
async function moneyReturned({ job, r, e }: Moment): Promise<string> {
  if (!r.id) return "no id";
  const how: Returned = e.event_type === "PAYMENT.CAPTURE.DENIED" ? "denied" : e.event_type === "PAYMENT.CAPTURE.REVERSED" ? "reversed" : "refunded";
  // Refunds and reversals are refund objects pointing "up" at their capture; a denial is the capture itself.
  const captureId = how === "denied" || e.resource_type === "capture" ? r.id : (parentOf(r, "captures") ?? r.supplementary_data?.related_ids?.capture_id);
  const charge = (await paymentsForJob(job.id)).find((p) => p.paypal_id === captureId && CAPTURE_KINDS.includes(p.kind));
  if (how === "denied" && !charge) return "nothing to do: the denied capture was never counted as paid";

  const back = cents(r.amount) ?? charge?.amount_cents ?? 0;
  const copy = returnedCopy(how, dollars(back), r.id, charge?.method);
  const added = await ensurePayment(job, {
    kind: "refund",
    status: how === "refunded" ? (r.status ?? "COMPLETED") : how.toUpperCase(),
    amountCents: back,
    paypalId: r.id,
    // refundJob works out what's left on each payment from the refunds against its order.
    orderId: charge ? charge.paypal_order_id : captureId ? await orderOfCapture(captureId) : null,
    method: charge?.method ?? "PayPal",
    note: copy.note,
  });
  if (added === "present") return "nothing to do: already in the ledger";
  const total = await addRefunded(job.id, back);
  const full = total.captured_cents > 0 && total.refunded_cents >= total.captured_cents;
  const updated = await updateJob(job.id, full ? { status: "refunded" } : {}, event(how, copy.text));
  notify(updated, "refunded", `${copy.title} · ${who(updated)}`, `${copy.body}${full ? " Everything collected is now refunded." : ""}`);
  return `${how} ${dollars(back)}`;
}

/** The order a capture came from, asked of PayPal when the ledger doesn't have the capture. */
async function orderOfCapture(captureId: string): Promise<string | null> {
  const capture = await pp<WebhookResource>(`/v2/payments/captures/${captureId}`).catch(() => null);
  return (capture && orderOf(capture)) ?? null;
}

/** Ledger note, timeline text and owner alert for money that went back. */
function returnedCopy(how: Returned, amount: string, id: string, method: string | null | undefined) {
  if (how === "denied") {
    return {
      note: "Capture denied by PayPal",
      text: `PayPal denied the ${amount} payment (capture ${id}), so it wasn't collected.`,
      title: "Payment denied",
      body: `PayPal denied the ${amount} payment. Collect it another way.`,
    };
  }
  if (how === "reversed") {
    return {
      note: "Chargeback or dispute",
      text: `PayPal reversed ${amount} of this payment, usually after a chargeback or dispute (reference ${id}).`,
      title: "Payment reversed",
      body: `PayPal took back ${amount}, usually after a chargeback or dispute. The details are in your PayPal account.`,
    };
  }
  return {
    note: FROM_WEBHOOK,
    text: `PayPal refunded ${amount} to the customer (refund ${id}).`,
    title: `Refunded ${amount}`,
    body: `${amount} went back to ${method ?? "the customer"}.`,
  };
}

/** Adds to the refunded total in one statement (as refundJob does), so a refund landing at the same moment isn't lost. */
async function addRefunded(jobId: string, amountCents: number): Promise<Job> {
  await ensureSchema();
  const [job] = (await client().query(`UPDATE jobs SET refunded_cents = refunded_cents + $1, updated_at = now() WHERE id = $2 RETURNING *`, [
    amountCents,
    jobId,
  ])) as Job[];
  if (!job) throw new Error(`Job ${jobId} not found`);
  return job;
}

/** VAULT.PAYMENT-TOKEN.CREATED: PayPal confirms the card or PayPal account saved on file. */
async function tokenCreated({ job, r }: Moment): Promise<string> {
  await updateJob(job.id, {}, event("paypal_webhook", `PayPal confirmed the ${tokenLabel(r) ?? savedLabel(job)} saved on file.`));
  return "noted on the timeline";
}

/**
 * VAULT.PAYMENT-TOKEN.DELETED: when Call Captain removed it (released or cancelled), PayPal is just
 * confirming. When the job still counts on it, it was removed at PayPal (by the customer, say), so
 * the card on file is gone: tell the owner.
 */
async function tokenDeleted({ job, r }: Moment): Promise<string> {
  if (!r.id) return "no token id";
  const label = tokenLabel(r) ?? savedLabel(job);
  const removedAtPayPal = job.vault_id === r.id;
  await ensurePayment(job, { kind: "card_removed", status: "DELETED", amountCents: 0, paypalId: r.id, note: removedAtPayPal ? "Removed at PayPal" : FROM_WEBHOOK });
  if (!removedAtPayPal) {
    await updateJob(job.id, {}, event("paypal_webhook", `PayPal confirmed the saved ${label} was deleted.`));
    return "noted on the timeline";
  }
  const updated = await updateJob(
    job.id,
    { vault_id: null, ...(job.status === "card_saved" ? { status: "released" as const } : {}) },
    event("card_removed", `The saved ${label} was removed at PayPal, so it can't be charged. Nothing was charged.`),
  );
  notify(updated, "follow_up", `Card on file removed · ${who(updated)}`, `The saved ${label} was removed at PayPal, so it can't be charged. Collect payment another way.`);
  return "card on file removed at PayPal";
}

async function inLedger(job: Job, kinds: PaymentKind[], paypalId: string): Promise<boolean> {
  return (await paymentsForJob(job.id)).some((p) => p.paypal_id === paypalId && kinds.includes(p.kind));
}

/**
 * Writes the ledger row unless it's there. recordPayment never throws, so a false is checked against
 * the ledger: "present" means someone got there first (the browser, the owner, an earlier delivery);
 * a missing row was a hiccup, thrown so the event is tried again.
 */
async function ensurePayment(job: Job, p: PaymentInput & { paypalId: string }): Promise<"added" | "present"> {
  if (await recordPayment(job, p)) return "added";
  if (await inLedger(job, [p.kind], p.paypalId)) return "present";
  throw new Error(`The payments ledger didn't take ${p.kind} ${p.paypalId}`);
}

/** PayPal amounts are decimal strings; a reversal can come negative. */
function cents(m?: Money): number | null {
  const n = Number(m?.value);
  return m?.value !== undefined && Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null;
}

const who = (job: Job) => job.customer_name ?? "A caller";
const holdLabel = (job: Job) =>
  job.hold_method === "keypad" ? `Card •••• ${job.card_last4 ?? ""} (keypad)` : job.card_last4 ? `Card •••• ${job.card_last4}` : "PayPal";
const savedLabel = (job: Job) => (job.vault_type === "card" ? `Card •••• ${job.card_last4 ?? ""}`.trim() : job.vault_type === "venmo" ? "Venmo" : "PayPal");
const orderLabel = (orderId: string) => getOrder(orderId).then(payerLabel, () => null);

function tokenLabel(r: WebhookResource): string | null {
  const s = r.payment_source;
  if (s?.card) return `${s.card.brand ? s.card.brand.charAt(0) + s.card.brand.slice(1).toLowerCase() : "Card"} •••• ${s.card.last_digits ?? ""}`.trim();
  if (s?.venmo) return "Venmo account";
  if (s?.paypal) return "PayPal account";
  return null;
}
