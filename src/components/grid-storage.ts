import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * View preferences remembered per browser (the Jobs tab, which columns show, column order and
 * widths). Every localStorage access is guarded: in a private window or with storage blocked the
 * app keeps working and simply forgets the preference.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readStored<T>(key: string): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is unavailable or full; the in-memory value still applies for this visit.
  }
  for (const l of listeners) l();
}

/**
 * A preference that survives reloads. The server render and hydration use `fallback` (storage
 * only exists in the browser), then the stored value takes over. Changes made this visit win
 * even when storage can't be written.
 */
export function usePreference<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): [T, (next: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const [local, setLocal] = useState<{ value: T } | null>(null);
  let stored: T | null = null;
  if (raw !== null) {
    try {
      stored = parse(JSON.parse(raw));
    } catch {
      stored = null;
    }
  }
  const value = local ? local.value : (stored ?? fallback);
  const set = useCallback(
    (next: T) => {
      setLocal({ value: next });
      writeStored(key, next);
    },
    [key],
  );
  return [value, set];
}
