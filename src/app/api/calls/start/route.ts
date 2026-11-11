import { NextResponse } from "next/server";
import { createJob } from "@/lib/db";
import { env } from "@/lib/env";
import { getBusiness } from "@/lib/settings";
import { createGuestToken } from "@/lib/signalwire";
import { currentWorkspace, isWorkspaceId } from "@/lib/workspace";

/**
 * A visitor taps the call button (Test call page, or the widget on a contractor's website).
 * We open a job in that business's workspace, then hand the browser a ten-minute guest token
 * that can dial only our agent. The job id rides along with the call (userVariables) so the
 * agent, the PayPal button and this page all share one job.
 *
 * Calls cost real minutes, so: a handful per IP per ten minutes (per server instance).
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS = 6;
const recent = new Map<string, number[]>();

function overLimit(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  const limited = hits.length >= MAX_CALLS;
  if (!limited) hits.push(now);
  recent.set(ip, hits);
  return limited;
}

export async function POST(req: Request) {
  if (!env.signalwireReady) {
    return NextResponse.json({ error: "Live calls aren't configured on this deployment." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (overLimit(ip)) {
    return NextResponse.json({ error: "Too many calls from this connection. Please try again in a few minutes." }, { status: 429 });
  }
  // The website widget names its business (data-business on the embed script); the app uses the visitor's workspace.
  const { business } = (await req.json().catch(() => ({}))) as { business?: string };
  const workspace = isWorkspaceId(business) ? business : await currentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Open the page again to start a call." }, { status: 400 });
  try {
    const b = await getBusiness(workspace);
    const job = await createJob(workspace, "web", b.serviceCallCents, null, b.secureWith);
    const { token, destination } = await createGuestToken();
    return NextResponse.json({ jobId: job.id, token, destination }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[calls/start]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The line couldn't be opened. Please try again." }, { status: 502 });
  }
}
