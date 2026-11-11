"use client";

import { useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/** On-screen phone keypad. Each press is a DTMF tone on the live call, like a real phone. */
export function Keypad({ onDigit }: { onDigit: (d: string) => void }) {
  const [typed, setTyped] = useState("");
  const press = (d: string) => {
    onDigit(d);
    setTyped((t) => (d === "#" ? "" : (t + d).slice(-24)));
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-7 font-mono text-lg tracking-widest text-slate-700" aria-live="polite">
        {typed.replace(/\d(?=\d{4})/g, "•") || <span className="text-sm tracking-normal text-slate-400">Digits go to the keypad, not the AI</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-12 w-16 rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-95"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
