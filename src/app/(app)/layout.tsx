import { Suspense } from "react";
import { Notifier } from "@/components/notifier";
import { Sidebar, SidebarPlaceholder } from "@/components/sidebar";
import { currentBusiness } from "@/lib/workspace";

async function Shell() {
  const { business } = await currentBusiness();
  return <Sidebar businessName={business.businessName} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<SidebarPlaceholder />}>
        <Shell />
      </Suspense>
      <div className="lg:pl-60">
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <footer className="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 pb-8 text-xs text-gray-400 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>Test mode: payments run on PayPal&apos;s sandbox, so no real money moves.</span>
          <a href="https://github.com/javafoo/callcaptain" className="hover:text-gray-600">Open source · MIT · GitHub</a>
        </footer>
      </div>
      <Notifier />
    </div>
  );
}
