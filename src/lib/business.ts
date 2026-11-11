import { DEFAULT_VOICE_ID } from "./voices";

/**
 * What the owner sets on the Agent setup page. Client-safe: types, defaults and pure
 * helpers only. Loading and saving live in ./settings.ts.
 *
 * Everything the agent may say about money, area or staff comes from here and from the
 * tool results, never from the model's imagination.
 */

export const LANGUAGE_OPTIONS = [
  // Languages the speech engine (Deepgram nova-3) can detect and switch between mid-call.
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "pt", label: "Portuguese" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
] as const;

export type Business = {
  businessName: string;
  agentName: string;
  /** Cartesia voice id from ./voices.ts */
  voiceId: string;
  /** "plumbing and water heaters", in the owner's words. */
  services: string;
  serviceCallCents: number;
  tripFeeCents: number;
  /** ZIP codes or ZIP prefixes ("951" covers 95100 to 95199). Empty means anywhere. */
  serviceZips: string[];
  technician: string;
  eta: string;
  morningSlot: string;
  languages: string[];
  instructions: string;
};

export const DEFAULT_BUSINESS: Business = {
  businessName: "Harbor Plumbing & Heating",
  agentName: "Ava",
  voiceId: DEFAULT_VOICE_ID,
  services: "plumbing, water heaters, heating and drains",
  serviceCallCents: 14900,
  tripFeeCents: 7900,
  serviceZips: ["950", "951"],
  technician: "Marcus",
  eta: "35 to 45 minutes",
  morningSlot: "tomorrow between 7 and 9 AM",
  languages: ["en", "es"],
  instructions: "We don't work on commercial buildings. Every repair comes with a one-year warranty.",
};

export const TIMEZONE = "America/Los_Angeles";

export function shortName(b: Business): string {
  return b.businessName.replace(/\s*(&|and)\s+.*$/i, "").trim() || b.businessName;
}

export function zipFrom(text: string | null | undefined): string | null {
  return text?.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
}

/** null = we can't tell yet (no ZIP); true/false once we have one. */
export function inServiceArea(b: Business, zip: string | null): boolean | null {
  if (b.serviceZips.length === 0) return true;
  if (!zip) return null;
  return b.serviceZips.some((z) => zip.startsWith(z));
}

export function languageLabels(codes: string[]): string {
  return codes.map((c) => LANGUAGE_OPTIONS.find((l) => l.code === c)?.label ?? c).join(", ");
}
