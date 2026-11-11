import { NextResponse } from "next/server";
import { overnightBriefing, overnightJobs, type Briefing } from "@/lib/briefing";
import { listJobs } from "@/lib/db";
import { getBusiness } from "@/lib/settings";
import { currentWorkspace } from "@/lib/workspace";

/** The owner's overnight briefing. Regenerated only when the night's jobs change. */

export const maxDuration = 60;

const cache = new Map<string, { key: string; briefing: Briefing }>();

export async function GET() {
  const workspace = await currentWorkspace();
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 401 });
  const night = overnightJobs(await listJobs(workspace, 200));
  if (!night.length) return NextResponse.json({ briefing: null }, { headers: { "Cache-Control": "no-store" } });

  const key = night.map((j) => `${j.id}:${j.updated_at}`).join("|");
  const hit = cache.get(workspace);
  if (hit?.key === key) return NextResponse.json({ briefing: hit.briefing }, { headers: { "Cache-Control": "no-store" } });

  try {
    const briefing = await overnightBriefing(night, await getBusiness(workspace));
    cache.set(workspace, { key, briefing });
    return NextResponse.json({ briefing }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[briefing]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The briefing isn't available right now." }, { status: 502 });
  }
}
