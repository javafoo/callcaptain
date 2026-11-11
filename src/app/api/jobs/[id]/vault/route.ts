import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { originOf } from "@/lib/env";
import { confirmCardOnFile } from "@/lib/money";
import { createSetupToken, type VaultKind } from "@/lib/paypal";
import { getBusiness } from "@/lib/settings";

/**
 * Card on file, from the caller's screen:
 *   { action: "setup", kind: "card" | "paypal" | "venmo" } → a PayPal setup token for the button or card fields
 *   { action: "confirm", setupToken }                     → save it as the job's payment method ($0 charged)
 */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/vault">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.secure_with !== "card") return NextResponse.json({ error: "This job uses a hold, not a card on file." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; kind?: string; setupToken?: string };
  try {
    if (body.action === "setup") {
      if (job.status !== "awaiting_card") return NextResponse.json({ error: "Nothing to save right now." }, { status: 409 });
      const kind: VaultKind = body.kind === "paypal" || body.kind === "venmo" ? body.kind : "card";
      const b = await getBusiness();
      return NextResponse.json({ setupToken: await createSetupToken(kind, job.id, `${originOf(req)}/pay/${job.id}`, b.businessName) });
    }
    if (body.action === "confirm" && body.setupToken) {
      return NextResponse.json({ job: await confirmCardOnFile(job, body.setupToken) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[vault]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "PayPal error" }, { status: 402 });
  }
}
