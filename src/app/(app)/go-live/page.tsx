import { Suspense } from "react";
import { EmbedSnippet } from "@/components/embed-snippet";
import { GoLiveNotifications } from "@/components/go-live-notifications";
import { GoLivePhone } from "@/components/go-live-phone";
import { PageHeader } from "@/components/ui";
import { phoneLine } from "@/lib/phone";
import { currentAccessToken, currentBusiness } from "@/lib/workspace";

export const metadata = { title: "Go live" };

async function Sections() {
  const [{ workspace, business, editable }, accessToken] = await Promise.all([currentBusiness(), currentAccessToken()]);
  return (
    <div className="grid max-w-4xl gap-6">
      <GoLivePhone workspace={workspace} line={phoneLine()} testPhones={business.testPhones} editable={editable} />
      <EmbedSnippet workspace={workspace} />
      {/* The private access token opens this workspace on the owner's phone; never show it as text or put it in the embed snippet. */}
      <GoLiveNotifications workspace={workspace} accessToken={accessToken} />
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
