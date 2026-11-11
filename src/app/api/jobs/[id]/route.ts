import { NextResponse } from "next/server";
import { getJob, type Job } from "@/lib/db";
import { currentWorkspace } from "@/lib/workspace";

/**
 * The call page and the website widget poll this to follow a job live. The owner's own browser
 * gets the whole job; anyone else holding the job link (the caller, on a contractor's website)
 * gets it without the technician's phone, the payer's email, the approval device details or
 * PayPal vault ids.
 */
function forCaller(job: Job): Job {
  return { ...job, tech_phone: null, tech_call_id: null, call_id: null, payer_email: null, approval_evidence: null, vault_id: null, callback_phone: null, summary: null };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const [job, workspace] = await Promise.all([getJob(id), currentWorkspace()]);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job: workspace === job.business_id ? job : forCaller(job) }, { headers: { "Cache-Control": "no-store" } });
}
