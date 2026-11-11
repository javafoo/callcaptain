import { lookupZip, NO_SUCH_ZIP, type Place } from "./area";
import type { Business } from "./business";

/**
 * How soon the on-call technician can be there, estimated from ZIP codes: the straight-line
 * distance between the two ZIP centers, stretched for real roads, at night-time driving
 * speed, plus a few minutes to get rolling. Free, instant and good to about ten minutes; the
 * technician confirms the real number when the agent phones him to dispatch.
 */

const ROAD_FACTOR = 1.3; // roads aren't straight lines
const NIGHT_MPH = 38; // door to door, light night traffic
const GET_ROLLING_MIN = 10; // get up, load the truck, go

export type Eta = { minutes: number; window: string; miles: number };

type Point = { lat: number; lon: number };

export function milesBetween(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/** "25 to 35 minutes", "about an hour": how a dispatcher would say it. */
export function etaWindow(minutes: number): string {
  if (minutes < 60) {
    const low = Math.max(15, Math.round(minutes / 5) * 5);
    return `${low} to ${low + 10} minutes`;
  }
  if (minutes < 75) return "about an hour";
  if (minutes < 105) return "about an hour and a half";
  if (minutes < 135) return "about two hours";
  return `about ${Math.round(minutes / 60)} hours`;
}

export function estimateFrom(from: Point, to: Point): Eta {
  const miles = milesBetween(from, to) * ROAD_FACTOR;
  const minutes = GET_ROLLING_MIN + (miles / NIGHT_MPH) * 60;
  return { minutes: Math.round(minutes), window: etaWindow(minutes), miles: Math.round(miles) };
}

const located = (p: Place | typeof NO_SUCH_ZIP | null): p is Place & Point => Boolean(p && p !== NO_SUCH_ZIP && p.lat !== null && p.lon !== null);

/** Null when either ZIP is missing or unknown: use the owner's default window (`b.eta`) instead. */
export async function estimateEta(b: Business, toZip: string | null): Promise<Eta | null> {
  if (!b.baseZip || !toZip) return null;
  const [from, to] = await Promise.all([lookupZip(b.baseZip).catch(() => null), lookupZip(toZip).catch(() => null)]);
  if (!located(from) || !located(to)) return null;
  return estimateFrom(from, to);
}
