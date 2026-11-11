import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Notifier } from "@/components/notifier";
import { Sidebar } from "@/components/sidebar";
import { currentBusiness } from "@/lib/workspace";

/** The owner app installs to the Home Screen (src/app/manifest.ts), where iPhone allows alerts. */
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Call Captain", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // Brand ink navy, the color of the app's header.
  themeColor: "#0d1f33",
};

async function Shell() {
  const { business } = await currentBusiness();
  return <Sidebar businessName={business.businessName} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<Sidebar businessName="Your business" />}>
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
