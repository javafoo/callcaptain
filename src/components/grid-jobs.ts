import type { Job } from "@/lib/db";
import type { Payment } from "@/lib/ledger";
import { securingMethods } from "./grid-ledger";

/** How the Jobs grid reads a job: which tab it's in, what's held, how it was secured. */

export type TabId = "needs" | "live" | "follow" | "paid" | "all";

export const JOB_TABS: { id: TabId; label: string; slug: string; emptyTitle: string; emptyBody: string }[] = [
  {
    id: "needs",
    label: "Needs action",
    slug: "needs-action",
    emptyTitle: "Nothing needs you right now.",
    emptyBody: "Secured visits, dispatched technicians and balances due land here.",
  },
  {
    id: "live",
    label: "On a call",
    slug: "on-a-call",
    emptyTitle: "No one is on the line.",
    emptyBody: "A call shows up here the moment your agent answers, and moves on when the visit is secured.",
  },
  {
    id: "follow",
    label: "Follow up",
    slug: "follow-up",
    emptyTitle: "No one to call back.",
    emptyBody: "Calls that ended before a visit was secured, or came from outside your area, land here.",
  },
  {
    id: "paid",
    label: "Paid",
    slug: "paid",
    emptyTitle: "No paid jobs yet.",
    emptyBody: "Jobs land here once PayPal collects the final bill or a trip fee.",
  },
  { id: "all", label: "All", slug: "all", emptyTitle: "No calls yet.", emptyBody: "Every call your agent answers shows up here." },
];

export const TAB_IDS = JOB_TABS.map((t) => t.id);

const NEEDS = new Set(["hold_placed", "card_saved", "dispatched", "awaiting_approval", "balance_due"]);
const LIVE = new Set(["on_call", "awaiting_hold", "awaiting_card"]);
const PAID = new Set(["completed", "paid", "cancelled_fee", "refunded"]);

export function isTabId(v: unknown): v is TabId {
  return typeof v === "string" && JOB_TABS.some((t) => t.id === v);
}

export function inTab(job: Job, tab: TabId): boolean {
  switch (tab) {
    case "needs":
      return NEEDS.has(job.status);
    case "live":
      return LIVE.has(job.status);
    case "follow":
      return (job.status === "ended" || job.status === "out_of_area") && Boolean(job.callback_phone || job.customer_name);
    case "paid":
      return PAID.has(job.status);
    default:
      return true;
  }
}

/** The first tab (other than All) that shows this job. */
export function homeTab(job: Job): TabId {
  return JOB_TABS.find((t) => t.id !== "all" && inTab(job, t.id))?.id ?? "all";
}

export function tabCounts(jobs: Job[]): Record<TabId, number> {
  const counts: Record<TabId, number> = { needs: 0, live: 0, follow: 0, paid: 0, all: jobs.length };
  for (const j of jobs) {
    if (NEEDS.has(j.status)) counts.needs++;
    else if (LIVE.has(j.status)) counts.live++;
    else if (PAID.has(j.status)) counts.paid++;
    else if (inTab(j, "follow")) counts.follow++;
  }
  return counts;
}

/** Workflow order for sorting by status: live calls, then what needs the owner, then closed. */
export const STATUS_ORDER = [
  "on_call",
  "awaiting_hold",
  "awaiting_card",
  "hold_placed",
  "card_saved",
  "dispatched",
  "awaiting_approval",
  "balance_due",
  "scheduled",
  "ended",
  "out_of_area",
  "completed",
  "paid",
  "cancelled_fee",
  "refunded",
  "released",
];

const HOLD_OPEN = new Set(["hold_placed", "dispatched", "awaiting_approval"]);
const CARD_OPEN = new Set(["card_saved", "dispatched", "awaiting_approval"]);

/** Cents an open PayPal authorization is holding for this visit right now. */
export function heldCents(job: Job): number {
  return job.authorization_id && HOLD_OPEN.has(job.status) ? job.fee_cents : 0;
}

/** A card or PayPal account saved with PayPal Vault and not yet charged or removed ($0 held). */
export function cardOnFile(job: Job): boolean {
  return !job.authorization_id && Boolean(job.vault_id) && CARD_OPEN.has(job.status);
}

/** What PayPal collected for this job and kept: charges minus refunds. */
export function collectedCents(job: Pick<Job, "captured_cents" | "refunded_cents">): number {
  return (job.captured_cents ?? 0) - (job.refunded_cents ?? 0);
}

/** Was the visit ever secured (hold placed or card saved), whatever happened after. */
export function wasSecured(job: Job): boolean {
  if (job.authorization_id || job.vault_id || job.captured_cents > 0) return true;
  return job.events.some((e) => e.kind === "hold_placed" || e.kind === "card_saved");
}

export type PayMethod = {
  /** "PayPal", "Venmo", "Visa •••• 1111" */
  label: string;
  /** How it was taken: typed on the phone keypad, or saved on file with PayPal Vault. */
  tag: "keypad" | "on file" | null;
  kind: "paypal" | "venmo" | "card";
  /** The PayPal account email, when PayPal shared it. */
  email: string | null;
};

function methodKind(label: string): PayMethod["kind"] {
  if (/venmo/i.test(label)) return "venmo";
  if (/paypal/i.test(label)) return "paypal";
  return "card";
}

/**
 * How the visit was secured. The ledger knows exactly (PayPal, Venmo, the card brand); the job's
 * own fields are the fallback before the ledger has loaded.
 */
export function paymentMethod(job: Job, ledger: { method: string; onFile: boolean } | null): PayMethod | null {
  if (ledger) {
    let label = ledger.method;
    let tag: PayMethod["tag"] = ledger.onFile ? "on file" : null;
    if (/\s*\(keypad\)$/i.test(label)) {
      label = label.replace(/\s*\(keypad\)$/i, "");
      tag = "keypad";
    }
    const email = label.match(/^PayPal \((.+)\)$/)?.[1] ?? null;
    if (email) label = "PayPal";
    return { label, tag, kind: methodKind(label), email };
  }
  const card = `Card •••• ${job.card_last4 ?? ""}`.trim();
  if (job.hold_method === "keypad" && job.authorization_id) return { label: card, tag: "keypad", kind: "card", email: null };
  if (job.hold_method === "vault" && job.vault_type) {
    const label = job.vault_type === "card" ? card : job.vault_type === "venmo" ? "Venmo" : "PayPal";
    return { label, tag: "on file", kind: methodKind(label), email: null };
  }
  if (job.hold_method === "paypal" && job.authorization_id) {
    const label = job.card_last4 ? card : "PayPal";
    return { label, tag: null, kind: methodKind(label), email: null };
  }
  return null;
}

/** One line for search, sorting and CSV: "Visa •••• 1111 (keypad)". */
export function methodText(m: PayMethod | null | undefined): string {
  return m ? `${m.label}${m.tag ? ` (${m.tag})` : ""}` : "";
}

/** The agent's call to the on-call technician. */
export const TECH_STATUS: Record<string, { label: string; text: string; dot: string; live?: boolean }> = {
  calling: { label: "Calling…", text: "text-sky-700", dot: "bg-sky-500", live: true },
  accepted: { label: "Accepted", text: "text-brand-700", dot: "bg-brand-500" },
  declined: { label: "Declined", text: "text-red-700", dot: "bg-red-500" },
  no_answer: { label: "No answer", text: "text-amber-700", dot: "bg-amber-500" },
  failed: { label: "Call failed", text: "text-gray-500", dot: "bg-gray-400" },
};

/** "Marcus · accepted", for search, sorting and CSV. */
export function techText(job: Pick<Job, "tech_name" | "tech_status"> | undefined): string {
  if (!job?.tech_name) return "";
  const status = job.tech_status ? TECH_STATUS[job.tech_status]?.label.replace("…", "").toLowerCase() : null;
  return status ? `${job.tech_name} · ${status}` : job.tech_name;
}

export const URGENCY: Record<string, { label: string; className: string }> = {
  emergency: { label: "Emergency", className: "bg-red-50 text-red-700 ring-red-200" },
  urgent: { label: "Urgent", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  routine: { label: "Routine", className: "bg-gray-100 text-gray-600 ring-gray-200" },
};

/** A job as the grid shows it: the job plus how it was secured. */
export type JobRow = Job & { method: PayMethod | null };

/**
 * Rows for the grid. A job that hasn't changed keeps its previous row object, so AG Grid leaves
 * it alone on each refresh and only changed cells re-render (and flash).
 */
export function buildRows(jobs: Job[], payments: Payment[], previous: JobRow[]): JobRow[] {
  const methods = securingMethods(payments);
  const before = new Map(previous.map((r) => [r.id, r]));
  const rows = jobs.map((job) => {
    const method = paymentMethod(job, methods.get(job.id) ?? null);
    const old = before.get(job.id);
    if (
      old &&
      old.updated_at === job.updated_at &&
      old.status === job.status &&
      old.events.length === job.events.length &&
      old.captured_cents === job.captured_cents &&
      old.refunded_cents === job.refunded_cents &&
      old.tech_status === job.tech_status &&
      methodText(old.method) === methodText(method)
    ) {
      return old;
    }
    return { ...job, method };
  });
  // Nothing changed: hand back the same array so the grid has nothing to do.
  return rows.length === previous.length && rows.every((r, i) => r === previous[i]) ? previous : rows;
}
