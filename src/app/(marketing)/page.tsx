import { Comparison } from "@/components/marketing/comparison";
import { Faq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { MoneyMoments } from "@/components/marketing/money-moments";
import { Owners } from "@/components/marketing/owners";
import { Pricing } from "@/components/marketing/pricing";
import { Problem } from "@/components/marketing/problem";
import { SourcesList } from "@/components/marketing/sources-list";
import { Trust } from "@/components/marketing/trust";
import { phoneLine } from "@/lib/phone";

// The landing page must stay fully prerendered: no cookies, headers or uncached data.
export const ensureStatic = "navigation";

export default function HomePage() {
  // Read at build time; the "Or call" line only shows when this deployment has a phone number.
  const phone = phoneLine();
  return (
    <>
      <Hero phone={phone} />
      <Problem />
      <HowItWorks />
      <MoneyMoments />
      <Owners />
      <Trust />
      <Comparison />
      <Pricing />
      <Faq />
      <SourcesList />
    </>
  );
}
