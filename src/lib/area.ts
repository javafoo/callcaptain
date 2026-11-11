import { neon } from "@neondatabase/serverless";
import { countyKey, hasAreaRules, zipListed, type Business } from "./business";

/**
 * Is this ZIP inside the owner's service area?
 *
 * ZIP rules are checked directly. County rules need the ZIP's county, which comes from two
 * free public lookups, cached in Postgres so each ZIP is looked up once:
 *   1. api.zippopotam.us/us/{zip}         → place name, state, latitude/longitude
 *   2. geo.fcc.gov/api/census/area        → county for that point (FCC / US Census)
 *
 * If a lookup fails, the answer is "unverified": the call goes ahead and the job is flagged,
 * because turning away a real emergency over a flaky lookup is worse than a manual check.
 */

export type Place = { zip: string; city: string; state: string; county: string };
export type AreaCheck = { inArea: boolean | null; place: Place | null; unverified?: boolean };

let ready: Promise<void> | null = null;
function sql() {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  return neon(process.env.DATABASE_URL);
}
function ensure() {
  ready ??= sql()
    .query(`CREATE TABLE IF NOT EXISTS zip_places (zip text PRIMARY KEY, city text, state text, county text, looked_up_at timestamptz NOT NULL DEFAULT now())`)
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function lookupZip(zip: string): Promise<Place | null> {
  await ensure();
  const cached = (await sql().query(`SELECT zip, city, state, county FROM zip_places WHERE zip = $1`, [zip])) as Place[];
  if (cached[0]) return cached[0];

  type Zippo = { places?: { "place name": string; "state abbreviation": string; latitude: string; longitude: string }[] };
  const z = await fetchJson<Zippo>(`https://api.zippopotam.us/us/${zip}`);
  const p = z?.places?.[0];
  if (!p) return null;
  type Fcc = { results?: { county_name?: string; state_code?: string }[] };
  const f = await fetchJson<Fcc>(`https://geo.fcc.gov/api/census/area?lat=${p.latitude}&lon=${p.longitude}&format=json`);
  const county = f?.results?.[0]?.county_name;
  if (!county) return null;

  const place: Place = { zip, city: p["place name"], state: p["state abbreviation"], county };
  await sql().query(`INSERT INTO zip_places (zip, city, state, county) VALUES ($1, $2, $3, $4) ON CONFLICT (zip) DO NOTHING`, [zip, place.city, place.state, place.county]);
  return place;
}

export async function checkArea(b: Business, zip: string | null): Promise<AreaCheck> {
  if (!hasAreaRules(b)) return { inArea: true, place: null };
  if (!zip) return { inArea: null, place: null };
  if (zipListed(b, zip)) return { inArea: true, place: await lookupZip(zip).catch(() => null) };
  if (b.serviceCounties.length === 0) return { inArea: false, place: await lookupZip(zip).catch(() => null) };

  const place = await lookupZip(zip).catch(() => null);
  if (!place) return { inArea: true, place: null, unverified: true };
  const key = countyKey({ county: place.county, state: place.state });
  return { inArea: b.serviceCounties.some((c) => countyKey(c) === key), place };
}
