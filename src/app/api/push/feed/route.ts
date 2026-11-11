import { NextResponse } from "next/server";
import { alertFeed } from "@/lib/push";
import { currentWorkspace } from "@/lib/workspace";

/**
 * The live alert feed every open app page polls (components/notifier.tsx): the jobs of this
 * workspace that changed since `?since=` (epoch ms from the previous answer's `now`), with only
 * the fields alerts need. Without `since`: the latest jobs, as the starting point.
 */
export async function GET(req: Request) {
  const workspace = await currentWorkspace();
  const raw = new URL(req.url).searchParams.get("since");
  const since = raw !== null && /^\d{10,16}$/.test(raw) ? Number(raw) : null;
  const feed = workspace ? await alertFeed(workspace, since) : { now: Date.now(), jobs: [] };
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}
