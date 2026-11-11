import { NextResponse } from "next/server";
import { areaToCounties } from "@/lib/ai";
import { countyKey, type County } from "@/lib/business";
import { getBusiness, resetBusiness, sanitize, saveBusiness } from "@/lib/settings";

export const maxDuration = 60;

const sameCounties = (a: County[], b: County[]) => a.map(countyKey).sort().join(";") === b.map(countyKey).sort().join(";");

/** Agent setup page. Demo settings, so open; the next call picks them up. */
export async function GET() {
  return NextResponse.json({ business: await getBusiness() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.reset === true) return NextResponse.json({ business: await resetBusiness() });
  const next = sanitize(body);
  const prev = await getBusiness();

  // Safety net: the area sentence changed but the counties didn't (a website import, or a new area
  // typed without clicking "Map area"). Calls are checked against the counties, so re-map them
  // here rather than silently keep the old area.
  let remapped = false;
  if (next.serviceAreaText.trim() && next.serviceAreaText !== prev.serviceAreaText && sameCounties(next.serviceCounties, prev.serviceCounties)) {
    try {
      const area = await areaToCounties(next.serviceAreaText);
      if (area?.counties.length) {
        next.serviceCounties = area.counties;
        remapped = true;
      }
    } catch (e) {
      console.error("[settings] auto-map failed", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ business: await saveBusiness(remapped ? sanitize(next) : next), remapped });
}
