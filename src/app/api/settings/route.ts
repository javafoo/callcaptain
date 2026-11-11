import { NextResponse } from "next/server";
import { getBusiness, resetBusiness, sanitize, saveBusiness } from "@/lib/settings";

/** Agent setup page. Demo settings, so open; the next call picks them up. */
export async function GET() {
  return NextResponse.json({ business: await getBusiness() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.reset === true) return NextResponse.json({ business: await resetBusiness() });
  return NextResponse.json({ business: await saveBusiness(sanitize(body)) });
}
