import { NextResponse } from "next/server";
import { areaToCounties } from "@/lib/ai";

/** "Northern Virginia and DC" → counties the owner can review before saving. */
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const area = text?.trim().slice(0, 200);
  if (!area) return NextResponse.json({ error: "Describe your service area first." }, { status: 400 });
  try {
    return NextResponse.json(await areaToCounties(area));
  } catch (e) {
    console.error("[settings/area]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't map that area right now. Try again, or add ZIP codes instead." }, { status: 502 });
  }
}
