import { neon } from "@neondatabase/serverless";
import { columnExists } from "./db";
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
 * A ZIP that doesn't exist at all (usually misheard) is different: the agent asks again.
 */

export type Place = { zip: string; city: string; state: string; county: string; lat: number | null; lon: number | null };
export type AreaCheck = { inArea: boolean | null; place: Place | null; unverified?: boolean; noSuchZip?: boolean };
/** The ZIP lookup answered, and that ZIP doesn't exist. */
export const NO_SUCH_ZIP = "no-such-zip" as const;

let ready: Promise<void> | null = null;
function sql() {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  return neon(process.env.DATABASE_URL);
}
function ensure() {
  ready ??= (async () => {
    if (await columnExists("zip_places", "lon")) return;
    await sql().query(`CREATE TABLE IF NOT EXISTS zip_places (zip text PRIMARY KEY, city text, state text, county text, looked_up_at timestamptz NOT NULL DEFAULT now())`);
    // ZIP centers, for arrival estimates (./eta.ts).
    await sql().query(`ALTER TABLE zip_places ADD COLUMN IF NOT EXISTS lat double precision`);
    await sql().query(`ALTER TABLE zip_places ADD COLUMN IF NOT EXISTS lon double precision`);
  })()
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

async function fetchJson<T>(url: string): Promise<T | null | 404> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (res.status === 404) return 404;
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function lookupZip(zip: string): Promise<Place | typeof NO_SUCH_ZIP | null> {
  await ensure();
  const cached = (await sql().query(`SELECT zip, city, state, county, lat, lon FROM zip_places WHERE zip = $1`, [zip])) as Place[];
  if (cached[0] && cached[0].lat !== null) return cached[0];

  type Zippo = { places?: { "place name": string; "state abbreviation": string; latitude: string; longitude: string }[] };
  const z = await fetchJson<Zippo>(`https://api.zippopotam.us/us/${zip}`);
  if (z === 404) return NO_SUCH_ZIP;
  const p = z?.places?.[0];
  if (!p) return cached[0] ?? null;
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (cached[0]) {
    // Cached before we kept coordinates: add them.
    await sql().query(`UPDATE zip_places SET lat = $2, lon = $3 WHERE zip = $1`, [zip, lat, lon]);
    return { ...cached[0], lat, lon };
  }
  type Fcc = { results?: { county_name?: string; state_code?: string }[] };
  const fr = await fetchJson<Fcc>(`https://geo.fcc.gov/api/census/area?lat=${p.latitude}&lon=${p.longitude}&format=json`);
  const f = fr === 404 ? null : fr;
  const county = f?.results?.[0]?.county_name;
  if (!county) return null;

  const place: Place = { zip, city: p["place name"], state: p["state abbreviation"], county, lat, lon };
  await sql().query(
    `INSERT INTO zip_places (zip, city, state, county, lat, lon) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (zip) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon`,
    [zip, place.city, place.state, place.county, lat, lon],
  );
  return place;
}

export async function checkArea(b: Business, zip: string | null): Promise<AreaCheck> {
  if (!hasAreaRules(b)) return { inArea: true, place: null };
  if (!zip) return { inArea: null, place: null };
  const found = await lookupZip(zip).catch((e) => {
    console.warn("[area] ZIP lookup failed", zip, e instanceof Error ? e.message : e);
    return null;
  });
  if (found === NO_SUCH_ZIP) return { inArea: null, place: null, noSuchZip: true };
  const place = found;
  if (zipListed(b, zip)) return { inArea: true, place };
  if (b.serviceCounties.length === 0) return { inArea: false, place };
  if (!place) return { inArea: true, place: null, unverified: true };
  const key = countyKey({ county: place.county, state: place.state });
  return { inArea: b.serviceCounties.some((c) => countyKey(c) === key), place };
}
