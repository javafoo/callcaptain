import type { Payment, PaymentKind } from "@/lib/ledger";
import { DAY_MS, startOfDay } from "./grid-format";

/** How the PayPal ledger reads: labels, colors and the money math behind the summary tiles. */

export const KIND: Record<PaymentKind, { label: string; pill: string; dot: string }> = {
  hold: { label: "Hold placed", pill: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  hold_capture: { label: "Charged from hold", pill: "bg-brand-50 text-brand-700 ring-brand-200", dot: "bg-brand-500" },
  hold_void: { label: "Hold released", pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400" },
  card_saved: { label: "Card saved", pill: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  card_charge: { label: "Card charged", pill: "bg-brand-50 text-brand-700 ring-brand-200", dot: "bg-brand-500" },
  trip_fee: { label: "Trip fee", pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  balance: { label: "Balance paid", pill: "bg-teal-50 text-teal-700 ring-teal-200", dot: "bg-teal-500" },
  refund: { label: "Refund", pill: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  card_removed: { label: "Card removed", pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400" },
};

/** Chip order: the life of a visit, from securing it to settling it. */
export const KIND_ORDER: PaymentKind[] = ["hold", "card_saved", "hold_capture", "card_charge", "balance", "trip_fee", "hold_void", "card_removed", "refund"];

export function kindLabel(kind: string): string {
  return KIND[kind as PaymentKind]?.label ?? kind;
}

/** Movements where money reached the business. */
const MONEY_IN = new Set<string>(["hold_capture", "card_charge", "trip_fee", "balance"]);

/** Money that actually moved, in cents: charges positive, refunds negative, holds and saves zero. */
export function movedCents(p: Pick<Payment, "kind" | "amount_cents">): number {
  if (MONEY_IN.has(p.kind)) return Math.abs(p.amount_cents);
  if (p.kind === "refund") return -Math.abs(p.amount_cents);
  return 0;
}

/** Ledger kinds that close a hold: charged from it, released, or the trip fee taken from it. */
const CLOSES_HOLD = new Set<string>(["hold_capture", "hold_void", "trip_fee"]);

/** Holds placed but not yet captured or released, read straight from the ledger. */
export function openHolds(payments: Payment[]): { cents: number; count: number } {
  const closed = new Set(payments.filter((p) => CLOSES_HOLD.has(p.kind)).map((p) => p.job_id));
  let cents = 0;
  let count = 0;
  for (const p of payments) {
    if (p.kind === "hold" && !closed.has(p.job_id)) {
      cents += Math.abs(p.amount_cents);
      count += 1;
    }
  }
  return { cents, count };
}

/** Each job's hold amount, so a "Hold released" row can say what it released. */
export function holdAmounts(payments: Payment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payments) if (p.kind === "hold") out.set(p.job_id, Math.abs(p.amount_cents));
  return out;
}

/** "VISA •••• 1111" (as PayPal names brands) reads as "Visa •••• 1111". */
export function prettyMethod(method: string | null | undefined): string {
  if (!method) return "";
  return method.replace(/^([A-Z][A-Z_]+)(?= ••••)/, (brand) =>
    brand
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" "),
  );
}

/** How each job's visit was secured, from its first hold or card-on-file movement. */
export function securingMethods(payments: Payment[]): Map<string, { method: string; onFile: boolean }> {
  const out = new Map<string, { method: string; onFile: boolean }>();
  // The API lists newest first; walk oldest first so the first securing movement wins.
  for (let i = payments.length - 1; i >= 0; i--) {
    const p = payments[i];
    if ((p.kind === "hold" || p.kind === "card_saved") && p.method && !out.has(p.job_id)) {
      out.set(p.job_id, { method: prettyMethod(p.method), onFile: p.kind === "card_saved" });
    }
  }
  return out;
}

/** PayPal's status words, in plain English. */
const STATUS: Record<string, { label: string; dot: string }> = {
  CREATED: { label: "Authorized", dot: "bg-indigo-500" },
  APPROVED: { label: "Approved", dot: "bg-indigo-500" },
  SAVED: { label: "Saved", dot: "bg-sky-500" },
  COMPLETED: { label: "Completed", dot: "bg-brand-500" },
  CAPTURED: { label: "Captured", dot: "bg-brand-500" },
  PARTIALLY_CAPTURED: { label: "Partly captured", dot: "bg-brand-500" },
  PENDING: { label: "Pending", dot: "bg-amber-500" },
  VOIDED: { label: "Voided", dot: "bg-gray-400" },
  DELETED: { label: "Removed", dot: "bg-gray-400" },
  DECLINED: { label: "Declined", dot: "bg-red-500" },
  DENIED: { label: "Denied", dot: "bg-red-500" },
  FAILED: { label: "Failed", dot: "bg-red-500" },
  EXPIRED: { label: "Expired", dot: "bg-gray-400" },
};

export function paypalStatus(status: string | null | undefined): { label: string; dot: string } {
  const s = (status ?? "").toUpperCase();
  return STATUS[s] ?? { label: s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "", dot: "bg-gray-300" };
}

export type RangeId = "today" | "7d" | "30d" | "all";

export const RANGES: { id: RangeId; label: string; note: string }[] = [
  { id: "today", label: "Today", note: "Today" },
  { id: "7d", label: "7 days", note: "Last 7 days" },
  { id: "30d", label: "30 days", note: "Last 30 days" },
  { id: "all", label: "All", note: "All time" },
];

/** The earliest moment inside a date range. */
export function rangeStart(range: RangeId, now: number): number {
  if (range === "today") return startOfDay(now);
  if (range === "7d") return now - 7 * DAY_MS;
  if (range === "30d") return now - 30 * DAY_MS;
  return Number.NEGATIVE_INFINITY;
}
