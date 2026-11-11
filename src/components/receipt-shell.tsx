import type { ReactNode } from "react";
import { Icon, cx } from "./ui";

/**
 * The customer's page, in one look for every step: the bill to approve, the balance to pay and
 * the receipt. Safe in server and client components (no data access here).
 */

export function BillShell({
  business,
  meta,
  label,
  amount,
  note,
  children,
}: {
  business: string;
  meta?: ReactNode;
  label: string;
  amount: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(16,24,40,0.08)] ring-1 ring-gray-200">
      <div className="bg-ink-900 px-6 py-6 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Icon name="wrench" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{business}</p>
            {meta && <p className="text-xs text-ink-300">{meta}</p>}
          </div>
        </div>
        <p className="mt-6 text-sm text-ink-300">{label}</p>
        <p className="text-4xl font-semibold tabular-nums tracking-tight">{amount}</p>
        {note && <p className="mt-1 text-sm text-ink-300">{note}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
      <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-500">
        <Icon name="shield" className="h-3.5 w-3.5" /> Payments secured by PayPal · test mode
      </div>
    </div>
  );
}

/** One line of a bill: what it is (and a smaller line under it), and the amount. */
export function BillRow({ label, sub, amount, strong, muted }: { label: ReactNode; sub?: ReactNode; amount: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className={cx("text-sm", strong ? "font-semibold text-gray-900" : muted ? "text-gray-500" : "text-gray-700")}>{label}</p>
        {sub && <p className="mt-0.5 break-words text-xs text-gray-500">{sub}</p>}
      </div>
      <p className={cx("shrink-0 tabular-nums", strong ? "text-base font-semibold text-gray-900" : muted ? "text-sm text-gray-500" : "text-sm text-gray-900")}>{amount}</p>
    </div>
  );
}

/** A titled group of rows. */
export function BillSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="mt-1 divide-y divide-gray-100">{children}</div>
    </div>
  );
}
