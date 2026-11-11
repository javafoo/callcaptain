import { NextResponse } from "next/server";
import { areaToCounties } from "@/lib/ai";
import { countyKey, type County } from "@/lib/business";
import { getBusiness, hasSavedBusiness, resetBusiness, sanitize, saveBusiness, toInput } from "@/lib/settings";
import { canEdit, currentWorkspace } from "@/lib/workspace";

export const maxDuration = 60;

const sameCounties = (a: County[], b: County[]) => a.map(countyKey).sort().join(";") === b.map(countyKey).sort().join(";");

/** The visitor's Agent setup. The next call picks it up. */
export async function GET() {
  const workspace = await currentWorkspace();
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 401 });
  const [business, editable, saved] = await Promise.all([getBusiness(workspace), canEdit(workspace), hasSavedBusiness(workspace)]);
  return NextResponse.json(
    { business, workspace, editable, saved },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Save the Agent setup. Fields left out keep their saved values, so a page can update just its part. */
export async function PUT(req: Request) {
  const workspace = await currentWorkspace();
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 401 });
  if (!(await canEdit(workspace))) {
    return NextResponse.json({ error: "This is the public demo line's business. Open your own workspace to change settings." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.reset === true) return NextResponse.json({ business: await resetBusiness(workspace) });
  const prev = await getBusiness(workspace);
  const next = sanitize({ ...toInput(prev), ...body });

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
  return NextResponse.json({ business: await saveBusiness(workspace, remapped ? sanitize(toInput(next)) : next), remapped });
}

export const PATCH = PUT;
