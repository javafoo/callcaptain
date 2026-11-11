import { Suspense } from "react";
import { EmbedSnippet } from "@/components/embed-snippet";
import { GoLiveNotifications } from "@/components/go-live-notifications";
import { GoLivePhone } from "@/components/go-live-phone";
import { PageHeader } from "@/components/ui";
import { phoneLine } from "@/lib/phone";
import { currentBusiness } from "@/lib/workspace";

export const metadata = { title: "Go live · Call Captain" };

async function Sections() {
  const { workspace, business, editable } = await currentBusiness();
  return (
    <div className="grid max-w-4xl gap-6">
      <GoLivePhone workspace={workspace} line={phoneLine()} testPhones={business.testPhones} editable={editable} />
      <EmbedSnippet workspace={workspace} />
      <GoLiveNotifications workspace={workspace} />
    </div>
  );
}

export default function GoLivePage() {
  return (
    <>
      <PageHeader
        title="Go live"
        description="Put your agent on your after-hours phone line and your website, and get alerts on your phone when it secures a visit."
      />
      <Suspense fallback={<div className="h-[640px] max-w-4xl animate-pulse rounded-xl bg-gray-200/60" />}>
        <Sections />
      </Suspense>
    </>
  );
}
