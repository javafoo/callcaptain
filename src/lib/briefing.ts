import { generateText, Output } from "ai";
import { z } from "zod";
import { MODEL } from "./ai";
import type { Business } from "./business";
import type { Job } from "./db";
import { dollars } from "./format";
import { formatPhone } from "./phone";

/**
 * The owner's morning briefing: what happened overnight, in plain words, and who needs a
 * callback. Every number is computed here, in code; the AI only writes the sentences and
 * picks out the callbacks, so it can't invent an amount.
 */

export type Briefing = {
  headline: string;
  points: string[];
  callbacks: { jobId: string; name: string; phone: string | null; why: string }[];
  facts: Facts;
  generatedAt: string;
};

type Facts = {
  calls: number;
  secured: number;
  heldNow: number;
  collected: number;
  balanceDue: number;
  balanceDueCount: number;
  outOfArea: number;
  bookedMorning: number;
  unsecured: number;
  techAccepted: number;
  techMissed: number;
  refunded: number;
};

/** What each status means, so the AI describes jobs correctly. */
const MEANING: Record<string, string> = {
  on_call: "still on the call",
  awaiting_hold: "was asked to approve the PayPal hold",
  awaiting_card: "was asked to save a card",
  hold_placed: "PayPal hold placed, technician not sent yet",
  card_saved: "card saved with PayPal, technician not sent yet",
  dispatched: "PayPal hold placed and technician on the way",
  scheduled: "declined a night visit; booked for the morning",
  awaiting_approval: "work done; customer approving the final bill",
  completed: "work done and paid from the hold",
  balance_due: "work done; customer still owes the rest of the bill",
  paid: "work done and paid in full",
  refunded: "refunded",
  released: "hold released, nothing charged",
  cancelled_fee: "cancelled after the technician left; trip fee charged",
  out_of_area: "outside the service area; referred elsewhere",
  ended: "hung up before the visit was secured",
};

const HOURS = 30; // last night plus today, whatever time the owner looks
const SECURED = new Set(["hold_placed", "card_saved", "dispatched"]);

export function overnightJobs(jobs: Job[], now = Date.now()): Job[] {
  return jobs.filter((j) => now - Date.parse(j.created_at) < HOURS * 3_600_000);
}

function factsOf(jobs: Job[]): Facts {
  return {
    calls: jobs.length,
    secured: jobs.filter((j) => j.authorization_id || j.vault_id || j.captured_cents > 0).length,
    heldNow: jobs.filter((j) => SECURED.has(j.status) && j.hold_method !== "vault").reduce((s, j) => s + j.fee_cents, 0),
    collected: jobs.reduce((s, j) => s + (j.captured_cents ?? 0) - (j.refunded_cents ?? 0), 0),
    balanceDue: jobs.filter((j) => j.status === "balance_due").reduce((s, j) => s + (j.balance_cents ?? 0), 0),
    balanceDueCount: jobs.filter((j) => j.status === "balance_due").length,
    outOfArea: jobs.filter((j) => j.status === "out_of_area").length,
    bookedMorning: jobs.filter((j) => j.status === "scheduled").length,
    unsecured: jobs.filter((j) => j.status === "ended" && (j.customer_name || j.issue)).length,
    techAccepted: jobs.filter((j) => j.tech_status === "accepted").length,
    techMissed: jobs.filter((j) => j.tech_status === "declined" || j.tech_status === "no_answer" || j.tech_status === "failed").length,
    refunded: jobs.reduce((s, j) => s + (j.refunded_cents ?? 0), 0),
  };
}

const schema = z.object({
  headline: z
    .string()
    .describe('One plain sentence, under 20 words, with the night\'s key numbers, like "7 calls overnight: 5 visits secured with PayPal and $497 collected." No label or prefix.'),
  points: z.array(z.string()).describe("2 to 4 short sentences an owner skims on a phone: money secured, jobs in progress, anything unusual"),
  callbacks: z
    .array(z.object({ jobId: z.string(), why: z.string().describe("Why and when to call, one short sentence") }))
    .describe("Only callers who need a human today: hung up before the visit was secured, booked for the morning, a technician couldn't make it, a balance still due, or an unhappy customer. Most urgent first. Empty if none."),
});

export async function overnightBriefing(jobs: Job[], b: Business): Promise<Briefing> {
  const facts = factsOf(jobs);
  const rows = jobs.map((j) => ({
    jobId: j.id,
    name: j.customer_name,
    problem: j.issue,
    urgency: j.urgency,
    status: MEANING[j.status] ?? j.status,
    technician: j.tech_name ? `${j.tech_name} (${j.tech_status ?? "dispatched"})` : null,
    hasCallbackNumber: Boolean(j.callback_phone),
    mood: (j.summary as { customer_mood?: string } | null)?.customer_mood ?? null,
    balanceDue: j.status === "balance_due" ? dollars(j.balance_cents) : null,
    bookedFor: j.status === "scheduled" ? j.eta : null,
  }));
  const { output } = await generateText({
    model: MODEL,
    reasoning: "low",
    output: Output.object({ schema }),
    system: `You write the morning briefing for the owner of ${b.businessName}, a small home-repair company. Their AI dispatcher ${b.agentName} answered the after-hours line overnight. Use only the facts and numbers given; never invent amounts, names or events. Plain, warm, brief sentences. Say "held" for PayPal holds (nothing charged yet) and "collected" for money captured.`,
    prompt: `Numbers (already computed, use these exactly): ${JSON.stringify({
      calls: facts.calls,
      visitsSecuredWithPayPal: facts.secured,
      heldRightNow: dollars(facts.heldNow),
      collected: dollars(facts.collected),
      balancesStillDue: facts.balanceDueCount ? `${facts.balanceDueCount} (${dollars(facts.balanceDue)})` : "none",
      outsideServiceArea: facts.outOfArea,
      bookedForMorning: facts.bookedMorning,
      hungUpBeforeSecuring: facts.unsecured,
      techniciansConfirmedByPhone: facts.techAccepted,
      technicianCallsMissedOrDeclined: facts.techMissed,
    })}\n\nCalls: ${JSON.stringify(rows)}`,
  });
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return {
    headline: output.headline,
    points: output.points.slice(0, 4),
    callbacks: output.callbacks
      .filter((c) => byId.has(c.jobId))
      .slice(0, 5)
      .map((c) => {
        const j = byId.get(c.jobId)!;
        return { jobId: j.id, name: j.customer_name ?? "Caller", phone: j.callback_phone ? formatPhone(j.callback_phone) : null, why: c.why };
      }),
    facts,
    generatedAt: new Date().toISOString(),
  };
}
