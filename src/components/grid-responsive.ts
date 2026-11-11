import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * Columns that make room on small screens. Each column has the narrowest grid width at which it
 * shows by default; the owner can still turn any of them on or off from the Columns menu.
 */

export type ColumnSpec = { id: string; label: string; showFrom: number; locked?: boolean };

/** Column ids to hide at this grid width, honoring explicit choices from the Columns menu. */
export function hiddenColumns(specs: readonly ColumnSpec[], width: number, picked: Record<string, boolean>): string[] {
  return specs.filter((s) => !s.locked && !(picked[s.id] ?? width >= s.showFrom)).map((s) => s.id);
}

/**
 * The grid's own width, measured live: it changes with the window and when the job panel opens
 * beside it. Starts from an estimate so the first render already hides the right columns.
 */
export function useMeasuredWidth(estimate: () => number) {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : estimate()));
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [measure, width] as const;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function onMotionChange(listener: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** True when the visitor asked for less motion: rows stop sliding (values still glow when they change). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(onMotionChange, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
}

/** Roughly how wide the main content is at this window width (sidebar, page padding, card border). */
export function contentWidth(windowWidth: number): number {
  const sidebar = windowWidth >= 1024 ? 240 : 0;
  const padding = windowWidth >= 1024 ? 64 : windowWidth >= 640 ? 48 : 32;
  return Math.min(1400, windowWidth - sidebar) - padding - 2;
}
