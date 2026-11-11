import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Jobs · Call Captain" };

async function DashboardForJob({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const { job } = await searchParams;
  return <Dashboard initialJobId={typeof job === "string" ? job : null} />;
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every after-hours call the agent took and the hold behind it. Charge the final bill, release a hold or apply the cancellation fee in one click."
      />
      <Suspense fallback={<div className="h-[640px] animate-pulse rounded-xl bg-gray-200/60" />}>
        <DashboardForJob searchParams={searchParams} />
      </Suspense>
    </>
  );
}
