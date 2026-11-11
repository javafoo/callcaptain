import { Suspense } from "react";
import { SetupForm } from "@/components/setup-form";
import { PageHeader } from "@/components/ui";
import { getBusiness } from "@/lib/settings";

export const metadata = { title: "Agent setup · Call Captain" };

async function Form() {
  return <SetupForm initial={await getBusiness()} />;
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
