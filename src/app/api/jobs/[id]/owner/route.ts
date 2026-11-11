import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { cancelVisit, completeJob, releaseHold } from "@/lib/money";
import { getBusiness } from "@/lib/settings";

/**
 * The owner's buttons in the dashboard:
 *   complete { finalDollars } → capture against the hold (and send a balance link if larger)
 *   release                   → void the hold, nothing charged
 *   cancel                    → cancellation policy (trip fee after dispatch)
 */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/owner">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; finalDollars?: number | string };
  const b = await getBusiness();
  try {
    switch (body.action) {
      case "complete": {
        const cents = Math.round(Number(body.finalDollars) * 100);
        return NextResponse.json({ job: await completeJob(job, b, cents) });
      }
      case "release":
        return NextResponse.json({ job: await releaseHold(job, "Released by the owner.") });
      case "cancel":
        return NextResponse.json({ job: (await cancelVisit(job, b)).job });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PayPal error" }, { status: 400 });
  }
}
