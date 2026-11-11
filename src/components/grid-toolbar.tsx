"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Button, Card, Icon, cx, inputClass } from "./ui";

/** The controls around the Jobs grid and the PayPal ledger: search, live status, columns, export, tiles, empty states. */

const GLYPHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  columns: <path d="M4 5h16v14H4zM9.5 5v14M14.5 5v14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  check: <path d="m5 12 5 5L20 7" />,
} as const;

export function Glyph({ name, className = "h-4 w-4" }: { name: keyof typeof GLYPHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {GLYPHS[name]}
    </svg>
  );
}

export function SearchBox({ value, onChange, label, placeholder, className }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; className?: string }) {
  return (
    <div className={cx("relative", className)}>
      <Glyph name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }
        }}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={cx(inputClass, "h-9 py-1.5 pl-9")}
      />
    </div>
  );
}

/** A green "Live" dot while the list refreshes itself; amber when the last refresh failed. */
export function LiveBadge({ online }: { online: boolean }) {
  return online ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
      </span>
      Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Reconnecting…
    </span>
  );
}

export function StatTile({
  label,
  value,
  note,
  icon,
  loading,
  tone = "default",
}: {
  label: string;
  value: string;
  note: ReactNode;
  icon: "phone" | "shield" | "clock" | "dollar" | "check";
  loading?: boolean;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span
          className={cx(
            "hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 sm:flex",
            tone === "good" ? "bg-brand-50 text-brand-600 ring-brand-100" : tone === "warn" ? "bg-violet-50 text-violet-600 ring-violet-100" : "bg-gray-50 text-gray-500 ring-gray-200",
          )}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <div className="mt-2.5 h-8 w-20 animate-pulse rounded-md bg-gray-100" />
      ) : (
        <p className="mt-2 truncate text-2xl font-semibold tabular-nums tracking-tight text-gray-900 sm:text-3xl">{value}</p>
      )}
      <p className="mt-1 text-xs text-gray-500">{loading ? " " : note}</p>
    </Card>
  );
}

export function ExportButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button type="button" variant="secondary" onClick={onClick} disabled={disabled} className="h-9 shrink-0 py-1.5">
      <Glyph name="download" />
      {children}
    </Button>
  );
}

/** Show or hide columns. Remembered per browser by the caller; Customer and Status can't be hidden. */
export function ColumnsMenu({
  columns,
  onToggle,
  onReset,
}: {
  columns: { id: string; label: string; visible: boolean }[];
  onToggle: (id: string, visible: boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Next keeps visited pages alive while hidden: come back to a closed menu.
  useLayoutEffect(() => () => setOpen(false), []);

  return (
    <div ref={root} className="relative">
      <Button
        ref={trigger}
        type="button"
        variant="secondary"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="h-9 shrink-0 py-1.5"
      >
        <Glyph name="columns" />
        Columns
      </Button>
      {open && (
        <div id={menuId} role="group" aria-label="Columns to show" className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-gray-500">Show columns</p>
          {columns.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={c.visible}
                onChange={(e) => onToggle(c.id, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-brand-600"
              />
              {c.label}
            </label>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            onClick={() => {
              onReset();
              setOpen(false);
              trigger.current?.focus();
            }}
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            Reset columns and widths
          </button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, actions }: { icon: "phone" | "dollar" | "jobs"; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gray-500">{children}</p>
      <div className="mt-6 flex flex-wrap items-start justify-center gap-3">{actions}</div>
    </div>
  );
}

export function TestCallLink() {
  return (
    <Link
      href="/call"
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
    >
      <Icon name="phone" className="h-4 w-4" />
      Make a test call
    </Link>
  );
}

/** Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern, automatic activation). */
export function useTabKeys<T extends string>(ids: readonly T[], active: T, pick: (id: T) => void) {
  return useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      const i = ids.indexOf(active);
      const next =
        e.key === "ArrowRight" ? ids[(i + 1) % ids.length] : e.key === "ArrowLeft" ? ids[(i - 1 + ids.length) % ids.length] : e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : null;
      if (!next) return;
      e.preventDefault();
      pick(next);
      const list = e.currentTarget.closest('[role="tablist"]');
      (list?.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
    },
    [ids, active, pick],
  );
}
