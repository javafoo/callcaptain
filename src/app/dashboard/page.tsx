import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";

export const metadata = { title: "Owner dashboard · Call Captain" };

async function DashboardForJob({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const { job } = await searchParams;
  return <Dashboard initialJobId={typeof job === "string" ? job : null} />;
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Harbor Plumbing &amp; Heating</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Owner dashboard</h1>
        <p className="mt-1 max-w-3xl text-slate-600">
          Every after-hours call Ava took, the hold behind it, and one click to charge the final bill, release the hold or apply the cancellation fee through PayPal.
        </p>
      </div>
      <Suspense fallback={<div className="h-[560px] animate-pulse rounded-2xl bg-slate-200/60" />}>
        <DashboardForJob searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
