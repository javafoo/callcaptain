import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { cancelVisit, chargeFromHold, refundJob, releaseHold, requestApproval } from "@/lib/money";
import { getBusiness } from "@/lib/settings";
import { canEdit, currentWorkspace } from "@/lib/workspace";

/**
 * The owner's and technician's buttons (only for jobs in their own workspace):
 *   request_approval { finalDollars, description? } → put the final bill on the customer's screen
 *                                                      (charged when they approve it there)
 *   charge_hold { finalDollars }                    → hold jobs, bill ≤ hold: capture it now, release the rest
 *   refund { amountDollars?, reason? }              → refund part (or, without an amount, all) of what was paid
 *   release                                         → void the hold / remove the card, nothing charged
 *   cancel                                          → cancellation policy (trip fee after dispatch)
 */

/** "$1,840.50" → 184050; anything that isn't a number → NaN (the money functions reject it). */
const cents = (v: unknown) => Math.round(Number(String(v ?? "").replace(/[$,\s]/g, "")) * 100);

export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/owner">) {
  const { id } = await ctx.params;
  const [job, workspace] = await Promise.all([getJob(id), currentWorkspace()]);
  if (!job || !workspace || job.business_id !== workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEdit(workspace))) return NextResponse.json({ error: "The public demo line is read-only. Open your own workspace to manage jobs." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    finalDollars?: number | string;
    description?: string;
    amountDollars?: number | string | null;
    reason?: string;
  };
  const b = await getBusiness(job.business_id);
  try {
    switch (body.action) {
      case "request_approval":
        return NextResponse.json({ job: await requestApproval(job, cents(body.finalDollars), body.description) });
      case "charge_hold":
        return NextResponse.json({ job: await chargeFromHold(job, b, cents(body.finalDollars)) });
      case "refund": {
        const amount = body.amountDollars === undefined || body.amountDollars === null || body.amountDollars === "" ? null : cents(body.amountDollars);
        return NextResponse.json({ job: await refundJob(job, b, amount, body.reason) });
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
