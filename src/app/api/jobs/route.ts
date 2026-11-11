import { NextResponse } from "next/server";
import { listJobs } from "@/lib/db";
import { currentWorkspace } from "@/lib/workspace";

/** The owner's jobs feed: this workspace's calls, newest first. */
export async function GET() {
  const workspace = await currentWorkspace();
  const jobs = workspace ? await listJobs(workspace, 200) : [];
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}
