import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { confirmPayPalHold } from "@/lib/money";

/** The caller approved the PayPal popup (onApprove). Place the hold and tell the agent. */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/hold">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  try {
    return NextResponse.json({ job: await confirmPayPalHold(job, orderId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PayPal error" }, { status: 402 });
  }
}
