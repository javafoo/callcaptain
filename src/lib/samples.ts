import { TIMEZONE, type Business } from "./business";
import { client, createJob, event, getJob, listJobs, updateJob, type Job } from "./db";
import { listPayments } from "./ledger";
import { approveFinalBill, bookMorning, cancelVisit, dispatchTechnician, holdKeypadCard, refundJob, releaseHold, requestApproval, saveKeypadCard } from "./money";

/**
 * "Load a sample night": seven after-hours calls from last night, each run through the real
 * PayPal sandbox (holds on a test card, captures that release the rest, a balance order with
 * Pay Later, a cancellation fee), so a new owner can explore the Jobs grid and the PayPal
 * ledger before making a call. Sample jobs are marked `sample`, labeled in the UI, and never
 * send alerts. The people and addresses are fictional; the PayPal transactions are real
 * sandbox transactions.
 */

const TEST_CARD = { number: "4111111111111111", expiryMonth: "12", expiryYear: "2029", cvv: "123", postalCode: "95131" };

type Outcome = "dispatched" | "completed" | "balance_due" | "cancelled_fee" | "scheduled" | "out_of_area";

type Sample = {
  /** Local time the call came in last night (business time zone). */
  at: string;
  name: string;
  phone: string;
  address: string;
  zip: string;
  issue: string;
  urgency: "emergency" | "urgent" | "routine";
  outcome: Outcome;
  finalCents?: number;
  /** What the technician wrote on the bill the customer approved. */
  work?: string;
  /** A partial refund the next morning (goodwill), through PayPal's refund API. */
  refund?: { cents: number; reason: string };
  ticket: { summary: string; problem: string; likely_work: string; safety_steps_taken: string; customer_mood: string; language: string };
};

const SAMPLES: Sample[] = [
  {
    at: "23:48",
    name: "Sam Patel",
    phone: "+14085550186",
    address: "16 Alpine Ct, Los Gatos",
    zip: "95030",
    issue: "Water heater leaking into the basement",
    urgency: "emergency",
    outcome: "dispatched",
    ticket: {
      summary: "Water heater leaking steadily into a finished basement. Caller closed the cold-water valve above the tank and moved boxes off the floor.",
      problem: "Leaking water heater",
      likely_work: "Check the relief valve and drain valve; tank replacement if the tank itself is leaking",
      safety_steps_taken: "Cold-water supply closed; told to stay clear of the outlets near the water",
      customer_mood: "stressed",
      language: "English",
    },
  },
  {
    at: "00:31",
    name: "Luis Ortega",
    phone: "+14085550142",
    address: "455 Pine Ave, Santa Clara",
    zip: "95050",
    issue: "Furnace won't light, no heat with a newborn at home",
    urgency: "urgent",
    outcome: "completed",
    finalCents: 12000,
    work: "Cleaned the flame sensor; the furnace lights normally",
    ticket: {
      summary: "No heat; the furnace clicks but won't light. Newborn at home and the house is down to 58°F. Caller spoke Spanish.",
      problem: "No heat",
      likely_work: "Clean or replace the flame sensor; check the igniter",
      safety_steps_taken: "No gas smell; thermostat set to heat; told to keep the baby in the warmest room",
      customer_mood: "stressed",
      language: "Spanish",
    },
  },
  {
    at: "01:12",
    name: "Grace Kim",
    phone: "+15105550119",
    address: "3021 Lakeshore Ave, Oakland",
    zip: "94610",
    issue: "Kitchen drain backing up",
    urgency: "routine",
    outcome: "out_of_area",
    ticket: {
      summary: "Kitchen sink drain backing up. The address is in Oakland, outside the service area, so nothing was held or dispatched.",
      problem: "Clogged kitchen drain",
      likely_work: "Referred to a local company",
      safety_steps_taken: "Told to stop using the dishwasher and sink",
      customer_mood: "calm",
      language: "English",
    },
  },
  {
    at: "02:07",
    name: "Dana Whitfield",
    phone: "+14085550134",
    address: "1834 Elm St, San Jose",
    zip: "95125",
    issue: "Water heater burst in the garage, water everywhere",
    urgency: "emergency",
    outcome: "balance_due",
    finalCents: 184000,
    work: "Replaced the 50-gallon gas water heater and hauled away the old tank",
    ticket: {
      summary: "50-gallon gas water heater burst in the garage, about an inch of water on the floor. Caller closed the cold-water valve and turned the gas control to pilot.",
      problem: "Burst water heater",
      likely_work: "Replace the 50-gallon gas water heater; haul away the old tank",
      safety_steps_taken: "Water shut off above the tank; gas set to pilot; kept away from the outlet by the washer",
      customer_mood: "upset",
      language: "English",
    },
  },
  {
    at: "03:26",
    name: "Mia Torres",
    phone: "+14085550177",
    address: "990 Cedar Ln, Milpitas",
    zip: "95035",
    issue: "Pipe under the kitchen sink split",
    urgency: "emergency",
    outcome: "cancelled_fee",
    ticket: {
      summary: "Supply line under the kitchen sink split. She closed the valve under the sink, then cancelled after the technician was on the way because a neighbor fixed it.",
      problem: "Split supply line",
      likely_work: "Replace the braided supply line",
      safety_steps_taken: "Shutoff under the sink closed",
      customer_mood: "calm",
      language: "English",
    },
  },
  {
    at: "04:40",
    name: "Tom Becker",
    phone: "+14085550158",
    address: "78 Willow Way, Campbell",
    zip: "95008",
    issue: "Toilet leaking at the base",
    urgency: "routine",
    outcome: "scheduled",
    ticket: {
      summary: "Slow leak at the base of the upstairs toilet. Didn't want a night visit, so he took the first morning slot.",
      problem: "Leaking toilet",
      likely_work: "Replace the wax ring and closet bolts",
      safety_steps_taken: "Toilet supply valve closed",
      customer_mood: "calm",
      language: "English",
    },
  },
  {
    at: "05:15",
    name: "Priya Raman",
    phone: "+14085550121",
    address: "2210 Oak Ct, Sunnyvale",
    zip: "94087",
    issue: "Sewer backing up into the shower",
    urgency: "emergency",
    outcome: "completed",
    finalCents: 14900,
    work: "Snaked the main line from the cleanout and checked it with a camera",
    refund: { cents: 4000, reason: "Goodwill credit, the line cleared faster than quoted" },
    ticket: {
      summary: "Sewage coming up through the ground-floor shower drain. Told the family to stop running water and keep kids out of the bathroom.",
      problem: "Main line clog",
      likely_work: "Snake the main line from the cleanout; camera inspection",
      safety_steps_taken: "All water use stopped; bathroom closed off",
      customer_mood: "upset",
      language: "English",
    },
  },
];

/** When each timeline moment happened, in minutes after the call came in. */
const OFFSET_MINUTES: Record<string, number> = {
  call: 0,
  agent: 0,
  details: 1,
  in_area: 1,
  out_of_area: 1,
  hold_requested: 3,
  hold_placed: 4,
  card_requested: 3,
  card_saved: 4,
  scheduled: 4,
  dispatched: 5,
  call_ended: 7,
  cancelled: 31,
  released: 31,
  captured: 152,
  charged: 152,
  balance_sent: 152,
  approval_requested: 148,
  approved: 151,
  refunded: 610,
};
const LEDGER_OFFSET_MINUTES: Record<string, number> = { hold: 4, card_saved: 4, trip_fee: 31, hold_void: 31, refund: 610 };

/** The most recent past moment when the business's clock read hh:mm. */
function lastNight(hhmm: string, now = Date.now()): number {
  const [h, m] = hhmm.split(":").map(Number);
  const wall = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date(t))
        .map((x) => [x.type, x.value]),
    );
    return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute) };
  };
  const today = wall(now);
  const naive = Date.UTC(today.y, today.mo - 1, today.d, h, m);
  const shown = wall(naive);
  const offset = Date.UTC(shown.y, shown.mo - 1, shown.d, shown.h, shown.mi) - naive;
  let t = naive - offset;
  if (t > now - 30 * 60_000) t -= 86_400_000;
  return t;
}

async function backdate(job: Job, start: number): Promise<void> {
  const events = job.events.map((e) => ({ ...e, at: new Date(start + (OFFSET_MINUTES[e.kind] ?? 2) * 60_000).toISOString() }));
  const last = Math.max(...events.map((e) => Date.parse(e.at)));
  await client().query(
    `UPDATE jobs SET created_at = $2, updated_at = $3, events = $4::jsonb, completed_at = CASE WHEN completed_at IS NULL THEN NULL ELSE $3::timestamptz END WHERE id = $1`,
    [job.id, new Date(start).toISOString(), new Date(last).toISOString(), JSON.stringify(events)],
  );
  const ledger = await client().query(`SELECT id, kind FROM payments WHERE job_id = $1`, [job.id]);
  for (const row of ledger as { id: string; kind: string }[]) {
    const minutes = LEDGER_OFFSET_MINUTES[row.kind] ?? 152;
    await client().query(`UPDATE payments SET created_at = $2 WHERE id = $1`, [row.id, new Date(start + minutes * 60_000).toISOString()]);
  }
}

async function run(workspace: string, b: Business, s: Sample): Promise<void> {
  // The night follows the owner's setting: card on file (the default) or the service-call hold.
  let job = await createJob(workspace, "phone", b.serviceCallCents, null, b.secureWith);
  job = await updateJob(
    job.id,
    {
      sample: true,
      customer_name: s.name,
      callback_phone: s.phone,
      service_address: s.address,
      zip: s.zip,
      issue: s.issue,
      urgency: s.urgency,
      summary: s.ticket,
    },
    event("details", `${s.name} at ${s.address} ${s.zip}: ${s.issue}`),
  );
  if (s.outcome === "out_of_area") {
    job = await updateJob(job.id, { status: "out_of_area" }, event("out_of_area", `${s.address} is outside the service area (${b.serviceAreaText}). No hold, no dispatch.`));
  } else if (s.outcome === "scheduled") {
    job = await bookMorning(job, b);
  } else {
    job = b.secureWith === "card" ? (await saveKeypadCard(job, TEST_CARD)).job : (await holdKeypadCard(job, b, TEST_CARD)).job;
    job = await dispatchTechnician(job, b);
    if (s.outcome === "cancelled_fee") job = (await cancelVisit(job, b)).job;
    if ((s.outcome === "completed" || s.outcome === "balance_due") && s.finalCents) {
      // The same path as on site: the bill goes to the customer and is approved (here by the sample, not a person).
      job = await requestApproval(job, s.finalCents, s.work ?? null);
      job = await approveFinalBill(job, b, s.finalCents, { ip: null, userAgent: "Sample night (no real customer)", via: "link" });
    }
    if (s.refund) job = await refundJob(job, b, s.refund.cents, s.refund.reason);
  }
  job = await updateJob(job.id, {}, event("call_ended", "Call ended. AI wrote the technician's ticket."));
  await backdate(job, lastNight(s.at));
}

export async function hasSampleNight(workspace: string): Promise<boolean> {
  return (await listJobs(workspace, 500)).some((j) => j.sample);
}

/** Runs every sample through PayPal in parallel. Returns how many jobs were created. */
export async function loadSampleNight(workspace: string, b: Business): Promise<number> {
  const results = await Promise.allSettled(SAMPLES.map((s) => run(workspace, b, s)));
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) console.error("[samples]", (f as PromiseRejectedResult).reason);
  if (failed.length === SAMPLES.length) throw new Error("PayPal's sandbox didn't respond. Try again in a minute.");
  return SAMPLES.length - failed.length;
}

/** Removes the sample jobs (releasing any hold still open) and their ledger rows. */
export async function clearSampleNight(workspace: string): Promise<number> {
  const samples = (await listJobs(workspace, 500)).filter((j) => j.sample);
  for (const j of samples) {
    if (j.authorization_id && (j.status === "hold_placed" || j.status === "dispatched")) {
      const fresh = await getJob(j.id);
      if (fresh) await releaseHold(fresh, "Sample cleared.").catch(() => {});
    }
  }
  const ids = samples.map((j) => j.id);
  if (!ids.length) return 0;
  await listPayments(workspace, 1); // makes sure the ledger table exists
  await client().query(`DELETE FROM payments WHERE job_id = ANY($1::uuid[])`, [ids]);
  await client().query(`DELETE FROM jobs WHERE business_id = $1 AND id = ANY($2::uuid[])`, [workspace, ids]);
  return ids.length;
}
