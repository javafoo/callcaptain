import { NextResponse } from "next/server";
import { event, getJob, updateJob } from "@/lib/db";
import { captureOrder, payerLabel } from "@/lib/paypal";

/** The customer paid the remaining balance (PayPal, Venmo, card or Pay Later). */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/balance">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status === "paid") return NextResponse.json({ job });
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  if (!orderId || orderId !== job.balance_order_id) return NextResponse.json({ error: "Wrong order" }, { status: 400 });
  try {
    const order = await captureOrder(orderId);
    const updated = await updateJob(
      job.id,
      { status: "paid", captured_cents: (job.captured_cents ?? 0) + (job.balance_cents ?? 0) },
      event("paid", `Balance paid with ${payerLabel(order)}. Job fully paid.`),
    );
    return NextResponse.json({ job: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PayPal error" }, { status: 402 });
  }
}
