"use client";

import { useState } from "react";
import { cx } from "./ui";

/** The fields SignalWire's secure keypad asks for, in order, with sandbox test values. */
export const KEYPAD_STEPS = [
  { key: "payment-card-number", label: "Card number", test: "4111111111111111", shown: "4111 1111 1111 1111" },
  { key: "expiration-date", label: "Expiration (MMYY)", test: "1229", shown: "12 / 29" },
  { key: "security-code", label: "Security code", test: "123", shown: "123" },
  { key: "postal-code", label: "Billing ZIP", test: "95131", shown: "95131" },
] as const;

const KEYS = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

/**
 * Guided secure keypad. It only unlocks once SignalWire reports its card collector is
 * running (pay status_url), so digits go to the payment step and never to the AI.
 */
export function SecureKeypad({
  serverStep,
  unlocked,
  onSend,
}: {
  serverStep: string | null;
  unlocked: boolean;
  onSend: (digits: string) => void;
}) {
  const [sent, setSent] = useState(0);
  const [showPad, setShowPad] = useState(false);
  const serverIdx = KEYPAD_STEPS.findIndex((s) => s.key === serverStep);
  const current = serverIdx >= 0 ? serverIdx : Math.min(sent, KEYPAD_STEPS.length - 1);
  const processing = serverStep === "payment-processing" || serverStep === "payment-completed";

  if (!unlocked) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4 text-sm text-ink-300">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-transparent" />
        Connecting the secure keypad…
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-2xl bg-white p-3 text-gray-900">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Secure keypad</p>
        <p className="text-[11px] text-gray-400">The AI can&apos;t hear these</p>
      </div>
      {processing ? (
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          Placing the hold with PayPal…
        </div>
      ) : (
        <ol className="space-y-1.5">
          {KEYPAD_STEPS.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li key={s.key} className={cx("flex items-center gap-2 rounded-xl px-2.5 py-2", now ? "bg-brand-50 ring-1 ring-brand-200" : "")}>
                <span
                  className={cx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    done ? "bg-brand-600 text-white" : now ? "bg-white text-brand-700 ring-1 ring-brand-300" : "bg-gray-100 text-gray-400",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={cx("flex-1 text-sm", now ? "font-medium text-gray-900" : done ? "text-gray-500" : "text-gray-400")}>{s.label}</span>
                {now && (
                  <button
                    type="button"
                    onClick={() => {
                      onSend(`${s.test}#`);
                      setSent((n) => Math.max(n, i + 1));
                    }}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 font-mono text-xs font-semibold text-white hover:bg-brand-700"
                    title="Types the sandbox test value, then #"
                  >
                    {s.shown} #
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" onClick={() => setShowPad((v) => !v)} className="w-full text-center text-xs font-medium text-gray-500 hover:text-gray-800">
        {showPad ? "Hide keypad" : "Type it yourself instead"}
      </button>
      {showPad && (
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map(([k, sub]) => (
            <button
              key={k}
              type="button"
              onClick={() => onSend(k)}
              className="flex h-10 flex-col items-center justify-center rounded-xl bg-gray-100 text-base font-medium leading-none text-gray-900 transition hover:bg-gray-200 active:scale-95"
            >
              {k}
              {sub && <span className="mt-0.5 text-[8px] font-semibold tracking-widest text-gray-400">{sub}</span>}
            </button>
          ))}
        </div>
      )}
      <p className="px-1 text-[11px] leading-snug text-gray-400">Press # after each item. The voice will ask for each one in turn.</p>
    </div>
  );
}
