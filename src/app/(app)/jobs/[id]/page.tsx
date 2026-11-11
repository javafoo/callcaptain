import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { JobOnSite } from "@/components/job-on-site";
import { Card, Icon } from "@/components/ui";
import { getJob } from "@/lib/db";
import { canEdit, currentWorkspace } from "@/lib/workspace";

export const metadata = { title: "On site" };

/** The technician's phone on site: one job, big buttons, the final bill. Only for the job's own workspace. */
async function OnSite({ params }: { params: PageProps<"/jobs/[id]">["params"] }) {
  const { id } = await params;
  const [job, workspace] = await Promise.all([getJob(id), currentWorkspace()]);
  if (!job) notFound();
  if (!workspace || job.business_id !== workspace) return <NotHere />;
  return <JobOnSite initialJob={job} editable={await canEdit(workspace)} />;
}

function NotHere() {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-gray-400 ring-1 ring-gray-200">
        <Icon name="jobs" className="h-5 w-5" />
      </span>
      <p className="text-base font-semibold text-gray-900">This job isn&apos;t in this workspace</p>
      <p className="text-sm text-gray-500">
        On the computer you use for Call Captain, open the job in Jobs, tap <span className="font-medium text-gray-700">Open on phone</span> and scan the code with this phone.
      </p>
      <Link href="/dashboard" className="mt-2 text-sm font-semibold text-brand-700 hover:text-brand-600">
        Go to Jobs
      </Link>
    </Card>
  );
}

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <Suspense fallback={<div className="h-[640px] animate-pulse rounded-2xl bg-gray-200/60" />}>
        <OnSite params={params} />
      </Suspense>
    </div>
  );
}
