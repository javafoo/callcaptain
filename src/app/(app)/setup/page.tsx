import { Suspense } from "react";
import { SetupForm } from "@/components/setup-form";
import { PageHeader } from "@/components/ui";
import { currentBusiness } from "@/lib/workspace";

export const metadata = { title: "Agent setup" };

async function Form() {
  const { business, editable } = await currentBusiness();
  return <SetupForm initial={business} editable={editable} />;
}

export default function SetupPage() {
  return (
    <>
      <PageHeader title="Agent setup" description="Five minutes, no tech skills. Tell the agent who you are, what you charge and where you work. It handles the rest." />
      <Suspense fallback={<div className="h-[640px] animate-pulse rounded-xl bg-gray-200/60" />}>
        <Form />
      </Suspense>
    </>
  );
}
