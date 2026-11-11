import { client, columnExists, ensureSchema, type Job } from "./db";

/**
 * The payments ledger: one row per PayPal money movement (hold placed, captured or released,
 * card saved, charged or removed, balance paid, refunds). It's what the owner reconciles
 * against PayPal, and it keeps the capture ids that refunds need. Writes are idempotent per
 * PayPal id, so the browser, a retried webhook and PayPal's own webhook can all report the
 * same movement safely.
 */

export type PaymentKind =
  | "hold" // authorization placed, nothing charged
  | "hold_capture" // charged from the hold, the rest released
  | "hold_void" // hold released, nothing charged
  | "card_saved" // vaulted with PayPal, $0
  | "card_removed" // vault token deleted
  | "card_charge" // the saved method charged for the final bill
  | "trip_fee" // cancelled after dispatch
  | "balance" // the balance above the hold, paid by the customer
  | "refund";

export type Payment = {
  id: string;
  created_at: string;
  business_id: string;
  job_id: string;
  kind: PaymentKind;
  status: string;
  amount_cents: number;
  paypal_id: string | null;
  paypal_order_id: string | null;
  method: string | null;
  note: string | null;
  /** Joined from the job, for display. */
  customer_name?: string | null;
};

let ready: Promise<void> | null = null;

function ensureLedger(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    if (await columnExists("payments", "note")) return;
    const sql = client();
    await sql.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        business_id text NOT NULL,
        job_id uuid NOT NULL,
        kind text NOT NULL,
        status text NOT NULL,
        amount_cents integer NOT NULL DEFAULT 0,
        paypal_id text,
        paypal_order_id text,
        method text,
        note text
      )`);
    await sql.query(`CREATE INDEX IF NOT EXISTS payments_business_created ON payments (business_id, created_at DESC)`);
    await sql.query(`CREATE INDEX IF NOT EXISTS payments_job ON payments (job_id)`);
    await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS payments_kind_paypal_id ON payments (kind, paypal_id) WHERE paypal_id IS NOT NULL`);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export type PaymentInput = {
  kind: PaymentKind;
  status: string;
  amountCents: number;
  paypalId?: string | null;
  orderId?: string | null;
  method?: string | null;
  note?: string | null;
};

/**
 * Never throws: a ledger hiccup must not undo a payment PayPal already made.
 * Returns true only when this call wrote a new row, so callers that also bump totals on the job
 * (refunds, webhook replays) can do it exactly once.
 */
export async function recordPayment(job: Pick<Job, "id" | "business_id">, p: PaymentInput): Promise<boolean> {
  try {
    await ensureLedger();
    const rows = (await client().query(
      `INSERT INTO payments (business_id, job_id, kind, status, amount_cents, paypal_id, paypal_order_id, method, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (kind, paypal_id) WHERE paypal_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [job.business_id, job.id, p.kind, p.status, p.amountCents, p.paypalId ?? null, p.orderId ?? null, p.method ?? null, p.note ?? null],
    )) as { id: string }[];
    return rows.length > 0;
  } catch (e) {
    console.error("[ledger]", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function listPayments(businessId: string, limit = 500): Promise<Payment[]> {
  await ensureLedger();
  return (await client().query(
    `SELECT p.*, j.customer_name FROM payments p LEFT JOIN jobs j ON j.id = p.job_id WHERE p.business_id = $1 ORDER BY p.created_at DESC LIMIT $2`,
    [businessId, limit],
  )) as Payment[];
}

export async function paymentsForJob(jobId: string): Promise<Payment[]> {
  await ensureLedger();
  return (await client().query(`SELECT * FROM payments WHERE job_id = $1 ORDER BY created_at ASC`, [jobId])) as Payment[];
}
