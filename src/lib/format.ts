export function dollars(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

export const STATUS_LABEL: Record<string, string> = {
  on_call: "On the call",
  awaiting_hold: "Waiting for hold",
  hold_placed: "Hold placed",
  dispatched: "Tech dispatched",
  scheduled: "Booked for morning",
  completed: "Paid, hold settled",
  balance_due: "Balance link sent",
  paid: "Fully paid",
  released: "Released, $0 charged",
  cancelled_fee: "Cancelled, trip fee",
};

export const STATUS_TONE: Record<string, string> = {
  on_call: "bg-sky-100 text-sky-800",
  awaiting_hold: "bg-amber-100 text-amber-900",
  hold_placed: "bg-indigo-100 text-indigo-800",
  dispatched: "bg-blue-600 text-white",
  scheduled: "bg-slate-200 text-slate-800",
  completed: "bg-emerald-100 text-emerald-800",
  balance_due: "bg-orange-100 text-orange-900",
  paid: "bg-emerald-600 text-white",
  released: "bg-slate-100 text-slate-700",
  cancelled_fee: "bg-rose-100 text-rose-800",
};
