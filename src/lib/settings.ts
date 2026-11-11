import { neon } from "@neondatabase/serverless";
import { DEFAULT_BUSINESS, LANGUAGE_OPTIONS, type Business, type County } from "./business";
import { VOICES } from "./voices";

/**
 * One row per business. The demo has a single business, "demo", that anyone can edit from
 * the Agent setup page (and reset to the defaults).
 */

const ID = "demo";
let ready: Promise<void> | null = null;

function sql() {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  return neon(process.env.DATABASE_URL);
}

function ensure() {
  ready ??= sql()
    .query(`CREATE TABLE IF NOT EXISTS businesses (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`)
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

export async function getBusiness(): Promise<Business> {
  await ensure();
  const rows = (await sql().query(`SELECT data FROM businesses WHERE id = $1`, [ID])) as { data: Partial<Business> }[];
  return { ...DEFAULT_BUSINESS, ...(rows[0]?.data ?? {}) };
}

const clean = (v: unknown, max: number, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
const cents = (v: unknown, fallback: number, max: number) => {
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n > 0 && n <= max ? n : fallback;
};

/** Validate whatever the form sent; anything odd falls back to the default. */
export function sanitize(input: Record<string, unknown>): Business {
  const d = DEFAULT_BUSINESS;
  const serviceCallCents = cents(input.serviceCallDollars, d.serviceCallCents, 100000);
  const zips = Array.isArray(input.serviceZips) ? input.serviceZips : String(input.serviceZips ?? "").split(/[\s,]+/);
  const langs = Array.isArray(input.languages) ? input.languages.map(String) : d.languages;
  const known = new Set<string>(LANGUAGE_OPTIONS.map((l) => l.code));
  return {
    businessName: clean(input.businessName, 60, d.businessName),
    agentName: clean(input.agentName, 20, d.agentName),
    voiceId: VOICES.some((v) => v.id === input.voiceId) ? String(input.voiceId) : d.voiceId,
    services: clean(input.services, 120, d.services),
    serviceCallCents,
    // The trip fee is captured from the hold, so it can't be larger than the hold.
    tripFeeCents: Math.min(cents(input.tripFeeDollars, d.tripFeeCents, 100000), serviceCallCents),
    serviceAreaText: typeof input.serviceAreaText === "string" ? input.serviceAreaText.trim().slice(0, 200) : d.serviceAreaText,
    serviceCounties: (Array.isArray(input.serviceCounties) ? input.serviceCounties : d.serviceCounties)
      .filter((c): c is County => Boolean(c && typeof c === "object" && typeof (c as County).county === "string" && typeof (c as County).state === "string"))
      .map((c) => ({ county: c.county.trim().slice(0, 60), state: c.state.trim().toUpperCase().slice(0, 2) }))
      .slice(0, 80),
    serviceZips: zips.map((z) => String(z).replace(/\D/g, "")).filter((z) => z.length >= 3 && z.length <= 5).slice(0, 60),
    websiteUrl: typeof input.websiteUrl === "string" ? input.websiteUrl.trim().slice(0, 200) : "",
    knowledge: typeof input.knowledge === "string" ? input.knowledge.trim().slice(0, 3000) : "",
    technician: clean(input.technician, 30, d.technician),
    eta: clean(input.eta, 40, d.eta),
    morningSlot: clean(input.morningSlot, 60, d.morningSlot),
    languages: langs.filter((c) => known.has(c)).length ? langs.filter((c) => known.has(c)) : ["en"],
    instructions: typeof input.instructions === "string" ? input.instructions.trim().slice(0, 600) : d.instructions,
  };
}

export async function saveBusiness(b: Business): Promise<Business> {
  await ensure();
  await sql().query(
    `INSERT INTO businesses (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [ID, JSON.stringify(b)],
  );
  return b;
}

export async function resetBusiness(): Promise<Business> {
  return saveBusiness(DEFAULT_BUSINESS);
}
