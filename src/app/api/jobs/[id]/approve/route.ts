import { NextResponse } from "next/server";
import type { ApproveView } from "@/components/approve-bill";
import { getJob } from "@/lib/db";
import { approvalSummary, approveFinalBill, BillChanged } from "@/lib/money";
import { getBusiness } from "@/lib/settings";

/**
 * The customer approves the final bill, on their own phone (/pay/[id]) or on the technician's.
 * No sign-in, like the rest of the customer's page: the job's id is the key, and the amount
 * must be exactly what the technician sent.
 *
 *   GET                                       → what the customer is asked to approve, or the balance left to pay
 *   POST { amountCents, via: link | handoff } → approve: saves the time, IP and device, then charges through PayPal
 */

const noStore = { "Cache-Control": "no-store" };

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]/approve">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = await getBusiness(job.business_id);
  const view: ApproveView = {
    status: job.status,
    business: b.businessName,
    tech: job.tech_name,
    bill: await approvalSummary(job, b),
    balance:
      job.status === "balance_due" && job.balance_order_id
        ? { orderId: job.balance_order_id, balanceCents: job.balance_cents ?? 0, finalCents: job.final_cents ?? 0, paidCents: job.captured_cents }
        : null,
    clientId: process.env.PAYPAL_CLIENT_ID ?? "",
  };
  return NextResponse.json(view, { headers: noStore });
}

/** The first address in X-Forwarded-For is the customer's (the platform sets it). */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/approve">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { amountCents?: unknown; via?: unknown };
  const amountCents = Number(body.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Missing the amount you're approving." }, { status: 400 });
  const b = await getBusiness(job.business_id);
  try {
    const done = await approveFinalBill(job, b, amountCents, {
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
      via: body.via === "handoff" ? "handoff" : "link",
    });
    return NextResponse.json(
      {
        status: done.status,
        approved: Boolean(done.approved_at),
        balanceOrderId: done.status === "balance_due" ? done.balance_order_id : null,
        balanceCents: done.status === "balance_due" ? (done.balance_cents ?? 0) : 0,
      },
      { headers: noStore },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "PayPal didn't take the payment.";
    return NextResponse.json({ error: message }, { status: e instanceof BillChanged ? 409 : 402, headers: noStore });
  }
}
