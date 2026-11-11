import { NextResponse } from "next/server";
import { listJobs } from "@/lib/db";

/** Owner dashboard feed. Sandbox demo data only, so it is open for judges. */
export async function GET() {
  const jobs = await listJobs(200);
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}
