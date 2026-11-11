import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { cancelVisit, completeJob, releaseHold } from "@/lib/money";
import { getBusiness } from "@/lib/settings";
import { canEdit, currentWorkspace } from "@/lib/workspace";

/**
 * The owner's buttons in the dashboard (only for jobs in the owner's own workspace):
 *   complete { finalDollars, approved } → hold: capture (and send a balance link if larger);
 *                                         card on file: charge the approved final bill to the saved card
 *   release                   → void the hold, nothing charged
 *   cancel                    → cancellation policy (trip fee after dispatch)
 */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/owner">) {
  const { id } = await ctx.params;
  const [job, workspace] = await Promise.all([getJob(id), currentWorkspace()]);
  if (!job || !workspace || job.business_id !== workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEdit(workspace))) return NextResponse.json({ error: "The public demo line is read-only. Open your own workspace to manage jobs." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; finalDollars?: number | string; approved?: boolean };
  const b = await getBusiness(job.business_id);
  try {
    switch (body.action) {
      case "complete": {
        const cents = Math.round(Number(body.finalDollars) * 100);
        // A card-on-file charge needs the customer's OK on the final price (stored-credential consent).
        if (job.secure_with === "card" && job.vault_id && body.approved !== true) {
          return NextResponse.json({ error: "Confirm the customer approved this amount before charging their card." }, { status: 400 });
        }
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
