import { NextResponse } from "next/server";
import { clearSampleNight, hasSampleNight, loadSampleNight } from "@/lib/samples";
import { getBusiness } from "@/lib/settings";
import { canEdit, currentWorkspace } from "@/lib/workspace";

/** "Load a sample night" for the visitor's own workspace (real PayPal sandbox transactions), and clearing it. */

export const maxDuration = 60;

const WINDOW_MS = 60 * 60 * 1000;
const MAX_LOADS = 3;
const recent = new Map<string, number[]>();

async function owner(): Promise<string | NextResponse> {
  const workspace = await currentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Open the app again to get your workspace." }, { status: 401 });
  if (!(await canEdit(workspace))) return NextResponse.json({ error: "The public demo line is read-only." }, { status: 403 });
  return workspace;
}

export async function POST(req: Request) {
  const workspace = await owner();
  if (workspace instanceof NextResponse) return workspace;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const hits = (recent.get(ip) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  if (hits.length >= MAX_LOADS) return NextResponse.json({ error: "That's enough sample nights for now. Try again in an hour." }, { status: 429 });
  recent.set(ip, [...hits, Date.now()]);
  if (await hasSampleNight(workspace)) return NextResponse.json({ error: "The sample night is already loaded." }, { status: 409 });
  try {
    const created = await loadSampleNight(workspace, await getBusiness(workspace));
    return NextResponse.json({ created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load the sample night." }, { status: 502 });
  }
}

export async function DELETE() {
  const workspace = await owner();
  if (workspace instanceof NextResponse) return workspace;
  return NextResponse.json({ removed: await clearSampleNight(workspace) });
}
