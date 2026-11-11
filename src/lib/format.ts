export function dollars(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n % 1 === 0
    ? `$${n.toLocaleString("en-US")}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const STATUS_LABEL: Record<string, string> = {
  on_call: "On the call",
  awaiting_hold: "Awaiting hold",
  hold_placed: "Hold placed",
  dispatched: "Dispatched",
  scheduled: "Booked for morning",
  awaiting_approval: "Awaiting approval",
  completed: "Paid",
  balance_due: "Balance due",
  paid: "Paid in full",
  refunded: "Refunded",
  released: "Released",
  cancelled_fee: "Cancelled, fee kept",
  out_of_area: "Out of area",
  awaiting_card: "Saving card",
  card_saved: "Card on file",
  ended: "Call ended",
};

/** Pill colors: soft background, strong text, matching dot. */
export const STATUS_TONE: Record<string, { pill: string; dot: string }> = {
  on_call: { pill: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  awaiting_hold: { pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  hold_placed: { pill: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  dispatched: { pill: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
  scheduled: { pill: "bg-gray-100 text-gray-700 ring-gray-200", dot: "bg-gray-400" },
  awaiting_approval: { pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  completed: { pill: "bg-brand-50 text-brand-700 ring-brand-200", dot: "bg-brand-500" },
  balance_due: { pill: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  paid: { pill: "bg-brand-50 text-brand-700 ring-brand-200", dot: "bg-brand-500" },
  refunded: { pill: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  released: { pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400" },
  cancelled_fee: { pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  out_of_area: { pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400" },
  awaiting_card: { pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  card_saved: { pill: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  ended: { pill: "bg-gray-100 text-gray-500 ring-gray-200", dot: "bg-gray-300" },
};

export function shortId(id: string) {
  return `#${id.slice(0, 4).toUpperCase()}`;
}
