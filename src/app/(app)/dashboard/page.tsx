import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Jobs" };

async function DashboardForJob({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const { job } = await searchParams;
  return <Dashboard initialJobId={typeof job === "string" ? job : null} />;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-xl bg-gray-200/60" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-xl bg-gray-200/60" />
    </div>
  );
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every after-hours call your agent answered, live. Open a job to send the final bill for the customer to approve, charge the card on file, or apply the trip fee."
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardForJob searchParams={searchParams} />
      </Suspense>
    </>
  );
}
