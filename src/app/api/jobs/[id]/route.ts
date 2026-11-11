import { NextResponse } from "next/server";
import { getJob } from "@/lib/db";

/** The call page polls this to follow its job live. */
export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}
