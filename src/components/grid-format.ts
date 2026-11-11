/** Dates, times and CSV values for the Jobs grid and the PayPal ledger. Pure, browser-local time. */

export const DAY_MS = 86_400_000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "2:14 AM" */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Yesterday", "Mon, Nov 9", or "Nov 9, 2025" for another year. */
export function dayLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const today = startOfDay(now);
  if (t >= today) return "Today";
  if (t >= today - DAY_MS) return "Yesterday";
  const d = new Date(t);
  return d.getFullYear() === new Date(now).getFullYear()
    ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Wednesday, November 11, 2026 at 2:14 AM" for tooltips. */
export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
}

/** Local date for file names and CSV cells: 2026-11-11. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local date and time for CSV cells: 2026-11-11 02:14. Spreadsheets read it as a date. */
export function isoMinute(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${isoDay(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Dollars for CSV cells: plain numbers a spreadsheet can add up (149.00, -50.00). */
export function csvDollars(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "";
}

/** Grid height that hugs short lists and scrolls long ones: header + rows (+ totals row), clamped. */
export function gridHeight(rows: number, rowHeight: number, totals: boolean, min: number, max: number): number {
  const content = 42 + Math.max(rows, 1) * rowHeight + (totals ? rowHeight : 0) + 2;
  return Math.min(max, Math.max(min, content));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
