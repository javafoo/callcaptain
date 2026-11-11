import { createHash } from "node:crypto";
import { sendNotification } from "web-push";
import { client, ensureSchema, type HoldMethod, type JobStatus, type TechStatus } from "./db";

/**
 * Alerts on the owner's phone (Web Push, VAPID keys in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT). Each browser that turns on alerts on the Go live page saves its push
 * subscription under its workspace; notify() sends every alert to all of them. The app's own
 * live alerts read the light job feed at the bottom of this file.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Opened when the alert is tapped. Same-origin path. */
  url: string;
  /** One notification per job: a newer alert for the same job replaces the older one. */
  tag: string;
  kind: string;
};

export type PushResult = { sent: number; removed: number; failed: number };

/** A device that gets this workspace's alerts. `id` is a hash of its push endpoint, never the endpoint itself. */
export type AlertDevice = { id: string; label: string; since: string };

type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };

/** Browsers' push services. Anything else is refused, so nobody can make this server post to an arbitrary URL. */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const MAX_DEVICES = 20;
const SEND_TIMEOUT_MS = 5000;
/** How long a push service keeps an alert for a phone that's off or offline. */
const TTL_SECONDS = 12 * 60 * 60;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function vapidDetails() {
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

let ready: Promise<void> | null = null;

function ensurePush(): Promise<void> {
  ready ??= (async () => {
    const sql = client();
    await sql.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint text PRIMARY KEY,
        business_id text NOT NULL,
        p256dh text NOT NULL,
        auth text NOT NULL,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await sql.query(`CREATE INDEX IF NOT EXISTS push_subscriptions_business ON push_subscriptions (business_id, created_at DESC)`);
    // Rate limits for test alerts: one row per key (workspace or IP).
    await sql.query(`
      CREATE TABLE IF NOT EXISTS push_rate (
        key text PRIMARY KEY,
        window_start timestamptz NOT NULL DEFAULT now(),
        count integer NOT NULL DEFAULT 0,
        last_at timestamptz NOT NULL DEFAULT now()
      )`);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const bytes = (s: string) => Buffer.from(s, "base64url").length;

/** A browser's PushSubscription.toJSON(), checked: a known push service and well-formed keys. */
export function parseSubscription(input: unknown): SubscriptionInput | null {
  if (!input || typeof input !== "object") return null;
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };
  if (typeof endpoint !== "string" || endpoint.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  const knownHost = PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  if (url.protocol !== "https:" || url.port || url.username || url.password || !knownHost) return null;
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh.replace(/=+$/, "") : "";
  const auth = typeof keys?.auth === "string" ? keys.auth.replace(/=+$/, "") : "";
  if (!B64URL.test(p256dh) || !B64URL.test(auth) || bytes(p256dh) !== 65 || bytes(auth) < 16 || bytes(auth) > 64) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** Save (or move) a device's subscription to this workspace. `replaces` is the endpoint it rotated from. */
export async function saveSubscription(businessId: string, sub: SubscriptionInput, userAgent: string | null, replaces?: string | null): Promise<void> {
  await ensurePush();
  const sql = client();
  await sql.query(
    `INSERT INTO push_subscriptions (endpoint, business_id, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET business_id = EXCLUDED.business_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [sub.endpoint, businessId, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 400) ?? null],
  );
  if (replaces && replaces !== sub.endpoint) await sql.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [replaces]);
  // Keep the newest devices only.
  await sql.query(
    `DELETE FROM push_subscriptions WHERE business_id = $1 AND endpoint NOT IN (
       SELECT endpoint FROM push_subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT ${MAX_DEVICES})`,
    [businessId],
  );
}

/**
 * Requests that change alert settings must come from this app's own pages (or a client with no
 * Origin, like curl, that still needs the workspace cookie).
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? new URL(req.url).host);
  } catch {
    return false;
  }
}

/** Knowing the endpoint is what proves a device owns it, so this needs nothing else. */
export async function removeSubscription(endpoint: string): Promise<void> {
  await ensurePush();
  await client().query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

export function deviceId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

function deviceLabel(userAgent: string | null, endpoint: string): string {
  const ua = userAgent ?? "";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua) || new URL(endpoint).hostname.endsWith("push.apple.com")
              ? "Safari"
              : null;
  // On iPhone and iPad, alerts only work in the app on the Home Screen, so the browser adds nothing.
  if (os === "iPhone" || os === "iPad") return os;
  if (os && browser) return `${os} · ${browser}`;
  return os ?? browser ?? "Browser";
}

export async function listDevices(businessId: string): Promise<AlertDevice[]> {
  await ensurePush();
  const rows = (await client().query(
    `SELECT endpoint, user_agent, created_at FROM push_subscriptions WHERE business_id = $1 ORDER BY created_at DESC`,
    [businessId],
  )) as { endpoint: string; user_agent: string | null; created_at: string | Date }[];
  return rows.map((r) => ({ id: deviceId(r.endpoint), label: deviceLabel(r.user_agent, r.endpoint), since: new Date(r.created_at).toISOString() }));
}

/**
 * Fixed-window rate limit kept in Postgres, so it holds across server instances. Allows one call
 * per `minSeconds` and `perHour` calls an hour for each key.
 */
export async function takeRate(key: string, minSeconds: number, perHour: number): Promise<boolean> {
  await ensurePush();
  const rows = (await client().query(
    `INSERT INTO push_rate (key, window_start, count, last_at) VALUES ($1, now(), 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN push_rate.window_start <= now() - interval '1 hour' THEN 1 ELSE push_rate.count + 1 END,
       window_start = CASE WHEN push_rate.window_start <= now() - interval '1 hour' THEN now() ELSE push_rate.window_start END,
       last_at = now()
     WHERE push_rate.last_at <= now() - make_interval(secs => $2)
     RETURNING count`,
    [key.slice(0, 200), minSeconds],
  )) as { count: number }[];
  return rows.length > 0 && rows[0].count <= perHour;
}

const host = (endpoint: string) => {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return "unknown";
  }
};

async function sendOne(sub: SubscriptionRow, body: string, topic: string | undefined): Promise<"sent" | "gone" | "failed"> {
  const vapid = vapidDetails();
  if (!vapid) return "failed";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
        vapidDetails: vapid,
        TTL: TTL_SECONDS,
        urgency: "high",
        topic,
        timeout: SEND_TIMEOUT_MS,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${SEND_TIMEOUT_MS / 1000}s`)), SEND_TIMEOUT_MS + 500);
      }),
    ]);
    return "sent";
  } catch (e) {
    const status = typeof (e as { statusCode?: unknown })?.statusCode === "number" ? (e as { statusCode: number }).statusCode : null;
    // 404 and 410: the browser unsubscribed or the subscription expired. It will never work again.
    if (status === 404 || status === 410) return "gone";
    const detail = status ? `HTTP ${status} ${String((e as { body?: unknown }).body ?? "").slice(0, 160)}`.trim() : e instanceof Error ? e.message : String(e);
    console.warn("[push] send failed", host(sub.endpoint), detail);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one alert to every device of a workspace, in parallel. Removes devices whose push service
 * says they're gone (404/410). Never throws.
 */
export async function pushToWorkspace(businessId: string, payload: PushPayload, topic?: string): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  try {
    if (!vapidDetails()) {
      console.warn("[push] VAPID keys are not set; skipping the push");
      return result;
    }
    await ensurePush();
    const subs = (await client().query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE business_id = $1`, [businessId])) as SubscriptionRow[];
    if (!subs.length) return result;
    const body = JSON.stringify({ ...payload, title: payload.title.slice(0, 120), body: payload.body.slice(0, 400), timestamp: Date.now() });
    const validTopic = topic && /^[A-Za-z0-9_-]{1,32}$/.test(topic) ? topic : undefined;
    const outcomes = await Promise.all(subs.map((s) => sendOne(s, body, validTopic)));
    const gone = subs.filter((_, i) => outcomes[i] === "gone").map((s) => s.endpoint);
    result.sent = outcomes.filter((o) => o === "sent").length;
    result.failed = outcomes.filter((o) => o === "failed").length;
    if (gone.length) {
      await client().query(`DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])`, [gone]);
      result.removed = gone.length;
      console.log("[push] removed", gone.length, "expired device(s) from", businessId);
    }
  } catch (e) {
    console.warn("[push]", businessId, e instanceof Error ? e.message : e);
  }
  return result;
}

/* ------------------------------------------------------------------------------------------------
 * The live alert feed: just the fields the app's alerts need, for the jobs that changed. Much
 * lighter than /api/jobs (no timeline or transcript), so every open page can poll it.
 * --------------------------------------------------------------------------------------------- */

export type AlertJob = {
  id: string;
  /** Epoch milliseconds (database clock). */
  created_ms: number;
  status: JobStatus;
  customer_name: string | null;
  issue: string | null;
  service_address: string | null;
  zip: string | null;
  urgency: string | null;
  callback_phone: string | null;
  fee_cents: number;
  secure_with: "hold" | "card";
  hold_method: HoldMethod | null;
  card_last4: string | null;
  vault_type: string | null;
  /** A PayPal authorization (hold) exists. */
  held: boolean;
  /** A card or PayPal account is saved on file right now. */
  on_file: boolean;
  tech_name: string | null;
  eta: string | null;
  tech_status: TechStatus | null;
  tech_ms: number | null;
  approval_cents: number | null;
  approved: boolean;
  captured_cents: number;
  refunded_cents: number;
  balance_cents: number | null;
};

export type AlertFeed = { now: number; jobs: AlertJob[] };

/** Overlap between polls, so a write that committed late is still picked up on the next poll. */
const FEED_OVERLAP = "30 seconds";

/**
 * Without `sinceMs`: the 100 most recently changed jobs. With it: the jobs changed since then.
 * Sample-night jobs never alert, here or by push.
 */
export async function alertFeed(businessId: string, sinceMs: number | null): Promise<AlertFeed> {
  await ensureSchema();
  const rows = (await client().query(
    `SELECT json_build_object(
       'now', floor(extract(epoch FROM now()) * 1000)::bigint,
       'jobs', COALESCE(json_agg(j), '[]'::json)
     ) AS feed
     FROM (
       SELECT id, floor(extract(epoch FROM created_at) * 1000)::bigint AS created_ms, status, customer_name, issue,
              service_address, zip, urgency, callback_phone, fee_cents, secure_with, hold_method, card_last4, vault_type,
              authorization_id IS NOT NULL AS held, vault_id IS NOT NULL AS on_file, tech_name, eta, tech_status,
              floor(extract(epoch FROM tech_updated_at) * 1000)::bigint AS tech_ms, approval_cents,
              approved_at IS NOT NULL AS approved, captured_cents, refunded_cents, balance_cents
       FROM jobs
       WHERE business_id = $1 AND NOT sample
         AND ($2::float8 IS NULL OR updated_at > to_timestamp($2::float8 / 1000) - interval '${FEED_OVERLAP}')
       ORDER BY updated_at DESC
       LIMIT 100
     ) j`,
    [businessId, sinceMs],
  )) as { feed: AlertFeed }[];
  return rows[0]?.feed ?? { now: Date.now(), jobs: [] };
}
