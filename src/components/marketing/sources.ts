/**
 * Every number on the landing page comes from one of these. Footnote numbers are the
 * position in this list, so keep it in the order the citations first appear on the page.
 */

export type SourceKey = "servicetitan" | "invoca" | "callrail" | "fixr" | "census" | "eckoh" | "map" | "ruby";

export type Source = { key: SourceKey; cite: string; url: string };

export const SOURCES: Source[] = [
  {
    key: "servicetitan",
    cite: "ServiceTitan, Call Trends in the Trades (May 2025 to Jul 2026 data).",
    url: "https://www.servicetitan.com/guides/call-trends-in-the-trades",
  },
  {
    key: "invoca",
    cite: "Invoca, Home Services Lead Conversion Benchmarks Report 2026.",
    url: "https://invoca.com/reports/the-invoca-home-services-lead-conversion-benchmarks-report-2026",
  },
  {
    key: "callrail",
    cite: "CallRail, survey of 1,000 US consumers on missed calls, Sep 2025.",
    url: "https://www.callrail.com/blog/missed-calls-cost-businesses-more-than-ever",
  },
  {
    key: "fixr",
    cite: "Fixr, emergency plumbing cost guide, Oct 2026.",
    url: "https://www.fixr.com/articles/emergency-plumbing-costs-an-in-depth-guide-to-repairs-and-insurance",
  },
  {
    key: "census",
    cite: "US Census Bureau, Statistics of US Businesses 2022, NAICS 238220 (plumbing, heating and air-conditioning contractors).",
    url: "https://www.census.gov/data/tables/2022/econ/susb/2022-susb-annual.html",
  },
  {
    key: "eckoh",
    cite: "Eckoh, payment security report, Oct 2025.",
    url: "https://www.eckoh.com/hubfs/Downloads/Guides/eckoh-payment-security-report-oct25-v2.pdf",
  },
  {
    key: "map",
    cite: "MAP Communications, pricing page, Nov 2026.",
    url: "https://www.mapcommunications.com/pricing/",
  },
  {
    key: "ruby",
    cite: "Ruby, pricing page, Nov 2026.",
    url: "https://www.ruby.com/pricing/",
  },
];

export function sourceNumber(key: SourceKey): number {
  return SOURCES.findIndex((s) => s.key === key) + 1;
}
