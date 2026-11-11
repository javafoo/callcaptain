import { neon } from "@neondatabase/serverless";

/**
 * One table: a job is one emergency call and everything that follows it (the PayPal hold or
 * card on file, the technician, the final bill). Every money movement is also written to the
 * payments ledger (./ledger.ts). The schema creates itself on first use, so `npm run dev`
 * works against an empty database.
 */

export type JobStatus =
  | "on_call" // caller is talking to the agent
  | "awaiting_hold" // agent asked for the service-call hold
  | "hold_placed" // PayPal authorization exists, nothing charged
  | "dispatched" // technician on the way
  | "scheduled" // caller declined the hold; booked the first morning slot
  | "awaiting_approval" // the final bill was sent to the customer to approve on their own screen
  | "completed" // final amount captured, rest of the hold released
  | "balance_due" // hold captured, balance sent as a PayPal link (Pay Later eligible)
  | "paid" // paid in full
  | "refunded" // everything collected was refunded
  | "released" // hold voided, nothing charged
  | "cancelled_fee" // cancelled after dispatch, trip fee captured, rest released
  | "out_of_area" // address outside the owner's service area; nothing held
  | "awaiting_card" // card-on-file mode: agent asked the caller to save a card or PayPal
  | "card_saved" // card-on-file mode: saved with PayPal, $0 charged
  | "ended"; // the call ended before anything was secured or booked

export type HoldMethod = "paypal" | "keypad" | "vault";

/** Ava's phone call to the on-call technician. */
export type TechStatus = "calling" | "accepted" | "declined" | "no_answer" | "failed";

export type JobEvent = { at: string; kind: string; text: string };

export type Job = {
  id: string;
  created_at: string;
  updated_at: string;
  /** The workspace (business) this job belongs to. */
  business_id: string;
  status: JobStatus;
  channel: "web" | "phone";
  call_id: string | null;
  customer_name: string | null;
  callback_phone: string | null;
  service_address: string | null;
  zip: string | null;
  issue: string | null;
  urgency: string | null;
  fee_cents: number;
  hold_method: HoldMethod | null;
  order_id: string | null;
  authorization_id: string | null;
  authorization_expires: string | null;
  card_last4: string | null;
  /** The payer's email from PayPal, when PayPal shares it (for receipts). */
  payer_email: string | null;
  /** Which field SignalWire's secure keypad is collecting right now (pay status_url). */
  pay_step: string | null;
  captured_cents: number;
  refunded_cents: number;
  final_cents: number | null;
  balance_cents: number | null;
  balance_order_id: string | null;
  tech_name: string | null;
  eta: string | null;
  tech_phone: string | null;
  tech_call_id: string | null;
  tech_status: TechStatus | null;
  tech_updated_at: string | null;
  /** The final bill sent to the customer to approve, and when they approved it (and from what device). */
  approval_cents: number | null;
  approval_requested_at: string | null;
  approved_at: string | null;
  approval_evidence: Record<string, unknown> | null;
  completed_at: string | null;
  /** "hold" or "card", copied from the owner's setting when the call starts. */
  secure_with: "hold" | "card";
  /** Card-on-file mode: PayPal vault payment token and what it is ("card" | "paypal" | "venmo"). */
  vault_id: string | null;
  vault_type: string | null;
  summary: Record<string, unknown> | null;
  events: JobEvent[];
};

const DATABASE_URL = process.env.DATABASE_URL;

export function client() {
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL. See README.md → Run it yourself.");
  return neon(DATABASE_URL);
}

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const sql = client();
    await sql.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'on_call',
        channel text NOT NULL DEFAULT 'web',
        call_id text,
        customer_name text,
        callback_phone text,
        service_address text,
        issue text,
        urgency text,
        fee_cents integer NOT NULL DEFAULT 14900,
        hold_method text,
        order_id text,
        authorization_id text,
        authorization_expires timestamptz,
        card_last4 text,
        captured_cents integer NOT NULL DEFAULT 0,
        final_cents integer,
        balance_cents integer,
        balance_order_id text,
        tech_name text,
        eta text,
        summary jsonb,
        events jsonb NOT NULL DEFAULT '[]'::jsonb
      )`);
    // Additive migrations, safe to run on every cold start.
    for (const column of [
      "zip text",
      "pay_step text",
      "secure_with text NOT NULL DEFAULT 'hold'",
      "vault_id text",
      "vault_type text",
      "business_id text NOT NULL DEFAULT 'demo'",
      "payer_email text",
      "refunded_cents integer NOT NULL DEFAULT 0",
      "tech_phone text",
      "tech_call_id text",
      "tech_status text",
      "tech_updated_at timestamptz",
      "approval_cents integer",
      "approval_requested_at timestamptz",
      "approved_at timestamptz",
      "approval_evidence jsonb",
      "completed_at timestamptz",
    ]) {
      await sql.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ${column}`);
    }
    await sql.query(`CREATE INDEX IF NOT EXISTS jobs_call_id ON jobs (call_id)`);
    await sql.query(`CREATE INDEX IF NOT EXISTS jobs_tech_call_id ON jobs (tech_call_id)`);
    await sql.query(`CREATE INDEX IF NOT EXISTS jobs_business_created ON jobs (business_id, created_at DESC)`);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const JSON_COLUMNS = new Set(["summary", "approval_evidence"]);

const COLUMNS = new Set([
  "business_id",
  "status",
  "channel",
  "call_id",
  "customer_name",
  "callback_phone",
  "service_address",
  "zip",
  "issue",
  "urgency",
  "fee_cents",
  "hold_method",
  "order_id",
  "authorization_id",
  "authorization_expires",
  "card_last4",
  "payer_email",
  "pay_step",
  "captured_cents",
  "refunded_cents",
  "final_cents",
  "balance_cents",
  "balance_order_id",
  "tech_name",
  "eta",
  "tech_phone",
  "tech_call_id",
  "tech_status",
  "tech_updated_at",
  "approval_cents",
  "approval_requested_at",
  "approved_at",
  "approval_evidence",
  "completed_at",
  "secure_with",
  "vault_id",
  "vault_type",
  "summary",
]);

export type JobPatch = Partial<Omit<Job, "id" | "created_at" | "updated_at" | "events">>;

export async function createJob(
  businessId: string,
  channel: Job["channel"],
  feeCents: number,
  callId: string | null = null,
  secureWith: Job["secure_with"] = "hold",
): Promise<Job> {
  await ensureSchema();
  const rows = (await client().query(
    `INSERT INTO jobs (business_id, channel, fee_cents, call_id, secure_with, events) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
    [businessId, channel, feeCents, callId, secureWith, JSON.stringify([event("call", channel === "web" ? "Browser call started" : "Phone call answered")])],
  )) as Job[];
  return rows[0];
}

export async function getJob(id: string): Promise<Job | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ensureSchema();
  const rows = (await client().query(`SELECT * FROM jobs WHERE id = $1`, [id])) as Job[];
  return rows[0] ?? null;
}

export async function findJobByCall(callId: string): Promise<Job | null> {
  await ensureSchema();
  const rows = (await client().query(`SELECT * FROM jobs WHERE call_id = $1 ORDER BY created_at DESC LIMIT 1`, [callId])) as Job[];
  return rows[0] ?? null;
}

export async function findJobByTechCall(callId: string): Promise<Job | null> {
  await ensureSchema();
  const rows = (await client().query(`SELECT * FROM jobs WHERE tech_call_id = $1 ORDER BY created_at DESC LIMIT 1`, [callId])) as Job[];
  return rows[0] ?? null;
}

export async function listJobs(businessId: string, limit = 200): Promise<Job[]> {
  await ensureSchema();
  return (await client().query(`SELECT * FROM jobs WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2`, [businessId, limit])) as Job[];
}

/** Update columns and optionally append timeline events, in one statement. */
export async function updateJob(id: string, patch: JobPatch, ...events: JobEvent[]): Promise<Job> {
  await ensureSchema();
  const sets: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!COLUMNS.has(key) || value === undefined) continue;
    const json = JSON_COLUMNS.has(key);
    values.push(json && value !== null ? JSON.stringify(value) : value);
    sets.push(`${key} = $${values.length}${json ? "::jsonb" : ""}`);
  }
  if (events.length) {
    values.push(JSON.stringify(events));
    sets.push(`events = events || $${values.length}::jsonb`);
  }
  values.push(id);
  const rows = (await client().query(`UPDATE jobs SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`, values)) as Job[];
  if (!rows[0]) throw new Error(`Job ${id} not found`);
  return rows[0];
}

export function event(kind: string, text: string): JobEvent {
  return { at: new Date().toISOString(), kind, text };
}

export { dollars } from "./format";
