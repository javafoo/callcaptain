/**
 * The demo contractor. Everything the agent may say about money comes from here and from
 * the SWAIG function results, never from the model's imagination.
 */
export const BUSINESS = {
  name: "Harbor Plumbing & Heating",
  shortName: "Harbor Plumbing",
  agentName: "Ava",
  voice: "elevenlabs.Sarah",
  timezone: "America/Los_Angeles",
  /** After-hours service call. Held on the call, captured only after the job. */
  serviceCallCents: 14900,
  /** Kept if the customer cancels after the technician is already driving over. */
  tripFeeCents: 7900,
  technician: "Marcus",
  eta: "35 to 45 minutes",
  morningSlot: "tomorrow between 7 and 9 AM",
} as const;
