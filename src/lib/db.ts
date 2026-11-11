import { neon } from "@neondatabase/serverless";

/**
 * One table: a job is one emergency call and everything money-related that follows it.
 * The schema creates itself on first use so `npm run dev` works against an empty database.
 */

export type JobStatus =
  | "on_call" // caller is talking to the agent
  | "awaiting_hold" // agent asked for the service-call hold
  | "hold_placed" // PayPal authorization exists, nothing charged
  | "dispatched" // technician on the way
  | "scheduled" // caller declined the hold; booked the first morning slot
  | "completed" // final amount captured, rest of the hold released
  | "balance_due" // hold captured, balance sent as a PayPal link (Pay Later eligible)
  | "paid" // balance paid
  | "released" // hold voided, nothing charged
  | "cancelled_fee" // cancelled after dispatch, trip fee captured, rest released
  | "out_of_area" // address outside the owner's service area; nothing held
  | "awaiting_card" // card-on-file mode: agent asked the caller to save a card or PayPal
  | "card_saved" // card-on-file mode: saved with PayPal, $0 charged
  | "ended"; // the call ended before anything was secured or booked

export type HoldMethod = "paypal" | "keypad" | "vault";

export type JobEvent = { at: string; kind: string; text: string };

export type Job = {
  id: string;
  created_at: string;
  updated_at: string;
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
  /** Which field SignalWire's secure keypad is collecting right now (pay status_url). */
  pay_step: string | null;
  captured_cents: number;
  final_cents: number | null;
  balance_cents: number | null;
  balance_order_id: string | null;
  tech_name: string | null;
  eta: string | null;
  /** "hold" or "card", copied from the owner's setting when the call starts. */
  secure_with: "hold" | "card";
  /** Card-on-file mode: PayPal vault payment token and what it is ("card" | "paypal" | "venmo"). */
  vault_id: string | null;
  vault_type: string | null;
  summary: Record<string, unknown> | null;
  events: JobEvent[];
};

const DATABASE_URL = process.env.DATABASE_URL;

function client() {
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL. See README.md → Run it yourself.");
  return neon(DATABASE_URL);
}

let ready: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
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
    await sql.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS zip text`);
    await sql.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pay_step text`);
    await sql.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS secure_with text NOT NULL DEFAULT 'hold'`);
    await sql.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vault_id text`);
    await sql.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vault_type text`);
    await sql.query(`CREATE INDEX IF NOT EXISTS jobs_call_id ON jobs (call_id)`);
    await sql.query(`CREATE INDEX IF NOT EXISTS jobs_created ON jobs (created_at DESC)`);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const COLUMNS = new Set([
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
  "pay_step",
  "captured_cents",
  "final_cents",
  "balance_cents",
  "balance_order_id",
  "tech_name",
  "eta",
  "secure_with",
  "vault_id",
  "vault_type",
  "summary",
]);

export type JobPatch = Partial<Omit<Job, "id" | "created_at" | "updated_at" | "events">>;

export async function createJob(channel: Job["channel"], feeCents: number, callId: string | null = null, secureWith: Job["secure_with"] = "hold"): Promise<Job> {
  await ensureSchema();
  const rows = (await client().query(
    `INSERT INTO jobs (channel, fee_cents, call_id, secure_with, events) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
    [channel, feeCents, callId, secureWith, JSON.stringify([event("call", channel === "web" ? "Browser call started" : "Phone call answered")])],
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

export async function listJobs(limit = 200): Promise<Job[]> {
  await ensureSchema();
  return (await client().query(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1`, [limit])) as Job[];
}

/** Update columns and optionally append timeline events, in one statement. */
export async function updateJob(id: string, patch: JobPatch, ...events: JobEvent[]): Promise<Job> {
  await ensureSchema();
  const sets: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!COLUMNS.has(key) || value === undefined) continue;
    values.push(key === "summary" && value !== null ? JSON.stringify(value) : value);
    sets.push(`${key} = $${values.length}${key === "summary" ? "::jsonb" : ""}`);
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
