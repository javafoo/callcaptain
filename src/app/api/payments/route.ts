import { NextResponse } from "next/server";
import { listPayments } from "@/lib/ledger";
import { currentWorkspace } from "@/lib/workspace";

/** The workspace's PayPal ledger, newest first. */
export async function GET() {
  const workspace = await currentWorkspace();
  const payments = workspace ? await listPayments(workspace, 500) : [];
  return NextResponse.json({ payments }, { headers: { "Cache-Control": "no-store" } });
}
