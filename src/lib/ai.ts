import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * Setup helpers that use an LLM through the Vercel AI Gateway (model strings are routed by
 * the gateway; on Vercel it authenticates with the deployment's OIDC token). The default
 * runs on the gateway's free tier; set AI_MODEL (e.g. "anthropic/claude-sonnet-5.5") with
 * paid credits to swap models without touching code.
 */

const MODEL = process.env.AI_MODEL || "openai/gpt-5-mini";

const countySchema = z.object({
  county: z.string().describe('Exact US Census name, e.g. "Fairfax County", "Alexandria city", "District of Columbia"'),
  state: z.string().describe("Two-letter state code"),
});

/** "Northern Virginia and DC" → the counties and independent cities that make it up. */
export async function areaToCounties(text: string) {
  const { output } = await generateText({
    model: MODEL,
    reasoning: "low",
    output: Output.object({
      schema: z.object({
        counties: z.array(countySchema),
        summary: z.string().describe("One short sentence a dispatcher could read to a caller, e.g. 'Northern Virginia and Washington, DC'"),
      }),
    }),
    system:
      "You map a home-service business's service area, described in plain words, to US counties. Use the county names exactly as the US Census and FCC write them: 'Fairfax County', 'Prince William County', independent cities as 'Alexandria city', Washington DC as 'District of Columbia'. For a radius ('within 30 miles of 22101'), include every county mostly inside that radius. Be inclusive of the commonly understood region, but never add counties that are clearly outside it.",
    prompt: `Service area: ${text}`,
  });
  return output;
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Refuse anything that isn't a public http(s) site, so this can't be pointed at internal hosts. */
export function publicUrl(raw: string): URL | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const h = url.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^(\d+\.){3}\d+$/.test(h) || h.includes(":")) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchPage(url: URL): Promise<{ html: string; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CallCaptainSetup/1.0 (+https://callcaptain.vercel.app)", Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 400_000);
    return { html, text: textOf(html) };
  } catch {
    return null;
  }
}

/** Read the homepage plus a few likely pages (services, areas, pricing, FAQ, about). */
export async function readWebsite(start: URL): Promise<{ pages: string[]; text: string }> {
  const home = await fetchPage(start);
  if (!home) throw new Error("Couldn't open that website. Check the address and try again.");
  const wanted = /(service|area|location|pric|rate|faq|question|about|emergenc|warrant|policy)/i;
  const links = [...home.html.matchAll(/href="([^"#?]+)"/gi)]
    .map((m) => {
      try {
        return new URL(m[1], start);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => Boolean(u && u.hostname === start.hostname && wanted.test(u.pathname)))
    .filter((u, i, all) => all.findIndex((x) => x.pathname === u.pathname) === i)
    .slice(0, 5);
  const others = await Promise.all(links.map((u) => fetchPage(u)));
  const pages = [start.toString(), ...links.map((u) => u.toString()).filter((_, i) => others[i])];
  const text = [home.text, ...others.filter(Boolean).map((p) => p!.text)].join("\n\n---\n\n").slice(0, 60_000);
  return { pages, text };
}

/** Turn a contractor's website into a draft Agent setup plus notes the agent can use on calls. */
export async function draftFromWebsite(siteText: string) {
  const { output } = await generateText({
    model: MODEL,
    reasoning: "low",
    output: Output.object({
      schema: z.object({
        businessName: z.string().nullable(),
        services: z.string().nullable().describe("What they do, under 120 characters, lowercase list like 'plumbing, water heaters and drain cleaning'"),
        serviceAreaText: z.string().nullable().describe("Service area as the site describes it, e.g. 'Northern Virginia and Washington, DC'"),
        serviceCallDollars: z.number().nullable().describe("After-hours or emergency service-call / dispatch / trip fee in dollars, only if the site states one"),
        instructions: z.string().nullable().describe("Policies the dispatcher must follow, from the site: what they don't do, warranties, payment terms. Short sentences."),
        knowledge: z.string().describe("Up to 15 short facts a phone dispatcher would use: hours, licenses, brands serviced, guarantees, common questions and answers. One per line."),
      }),
    }),
    system:
      "You read a home-service company's website and draft the settings for its after-hours AI phone dispatcher. Only use facts stated on the site. Leave a field null if the site doesn't say. Never invent prices.",
    prompt: siteText,
  });
  return output;
}
