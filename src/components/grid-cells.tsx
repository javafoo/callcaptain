"use client";

import type { CustomOverlayProps } from "ag-grid-react";
import { cx } from "./ui";

/** Cell and overlay pieces shared by the Jobs grid and the PayPal ledger. */

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      title="From “Load a sample night”: a fictional caller, with real PayPal sandbox payments."
      className={cx(
        "inline-flex shrink-0 items-center rounded-md bg-gray-100 px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide text-gray-500 ring-1 ring-inset ring-gray-200",
        className,
      )}
    >
      Sample
    </span>
  );
}

/** A small mark for PayPal, Venmo or a card in front of the method name. */
export function MethodGlyph({ kind }: { kind: "paypal" | "venmo" | "card" }) {
  if (kind === "card") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <rect x="3" y="5.5" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold italic leading-none text-white", kind === "venmo" ? "bg-[#008cff]" : "bg-[#003087]")}
    >
      {kind === "venmo" ? "V" : "P"}
    </span>
  );
}

export type OverlayText = { title: string; body?: string };

/** What the grid says when a tab or a search has no rows. */
export function GridOverlay(props: CustomOverlayProps & { messages?: Partial<Record<string, OverlayText>> }) {
  if (props.overlayType === "exporting") {
    return <div className="rounded-lg bg-white px-4 py-2 text-sm text-gray-600 shadow ring-1 ring-gray-200">Preparing the CSV…</div>;
  }
  if (props.overlayType === "loading") {
    return <div className="text-sm text-gray-500">Loading…</div>;
  }
  const text = props.messages?.[props.overlayType] ?? { title: "Nothing to show." };
  return (
    <div className="mx-auto max-w-sm px-6 text-center" role="status">
      <p className="text-sm font-medium text-gray-900">{text.title}</p>
      {text.body && <p className="mt-1 text-sm text-gray-500">{text.body}</p>}
    </div>
  );
}

/** "—" for an empty cell, quiet so the numbers stand out. */
export function Blank({ right }: { right?: boolean }) {
  return <span className={cx("text-gray-300", right && "block text-right")}>—</span>;
}
