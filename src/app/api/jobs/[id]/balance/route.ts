import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { confirmBalancePaid } from "@/lib/money";

/** The customer paid the remaining balance (PayPal, Venmo, card or Pay Later). */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/balance">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  try {
    return NextResponse.json({ job: await confirmBalancePaid(job, orderId ?? "") });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PayPal error" }, { status: 402 });
  }
}
