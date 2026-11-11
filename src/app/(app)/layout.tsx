import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { getBusiness } from "@/lib/settings";

async function Shell() {
  const b = await getBusiness();
  return <Sidebar businessName={b.businessName} />;
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
          <span>PayPal sandbox only. No real money moves. The business in this demo is fictional.</span>
          <a href="https://github.com/javafoo/callcaptain" className="hover:text-gray-600">Open source · MIT · GitHub</a>
        </footer>
      </div>
    </div>
  );
}
