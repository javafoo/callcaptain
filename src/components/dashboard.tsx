"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Job } from "@/lib/db";
import { dollars, shortId } from "@/lib/format";
import type { Payment } from "@/lib/ledger";
import { DAY_MS, plural } from "./grid-format";
import { buildRows, cardOnFile, heldCents, wasSecured, type JobRow } from "./grid-jobs";
import { movedCents } from "./grid-ledger";
import { Glyph, StatTile } from "./grid-toolbar";
import { GettingStarted } from "./getting-started";
import { JobPanel } from "./job-panel";
import { JobsGrid } from "./jobs-grid";
import { OvernightBriefing } from "./overnight-briefing";

/** The owner's command center: what the night looked like, every job live, and the selected job's money actions. */

type Data = { rows: JobRow[]; payments: Payment[]; loaded: boolean; online: boolean; at: number };

/** Changes whenever any job changes, so the ledger is only refetched when there's news. */
function signature(jobs: Job[]): string {
  let latest = "";
  for (const j of jobs) if (j.updated_at > latest) latest = j.updated_at;
  return `${jobs.length}:${latest}`;
}

function ownerStats(rows: JobRow[], payments: Payment[], now: number) {
  const weekAgo = now - 7 * DAY_MS;
  const calls = rows.length;
  const callsThisWeek = rows.filter((j) => Date.parse(j.created_at) >= weekAgo).length;
  const secured = rows.filter(wasSecured).length;
  const held = rows.reduce((sum, j) => sum + heldCents(j), 0);
  const holds = rows.filter((j) => heldCents(j) > 0).length;
  const cards = rows.filter(cardOnFile).length;
  let collected = 0;
  let refunded = 0;
  for (const p of payments) {
    if (Date.parse(p.created_at) < weekAgo) continue;
    const moved = movedCents(p);
    if (moved > 0) collected += moved;
    else refunded -= moved;
  }
  const heldNote = [holds ? plural(holds, "open hold") : null, cards ? `${plural(cards, "card")} on file` : null].filter(Boolean).join(" · ");
  return [
    { label: "After-hours calls answered", value: calls.toLocaleString("en-US"), note: `${callsThisWeek.toLocaleString("en-US")} in the last 7 days`, icon: "phone" as const },
    {
      label: "Visits secured",
      value: secured.toLocaleString("en-US"),
      note: calls ? `${Math.round((secured / calls) * 100)}% of calls` : "No calls yet",
      icon: "shield" as const,
      tone: secured ? ("good" as const) : undefined,
    },
    { label: "Secured right now", value: holds || !cards ? dollars(held) : plural(cards, "card"), note: heldNote || "Nothing open right now", icon: "clock" as const },
    {
      label: "Collected this week",
      value: dollars(collected - refunded),
      note: refunded ? `Last 7 days, after ${dollars(refunded)} refunded` : "Last 7 days, through PayPal",
      icon: "dollar" as const,
      tone: collected ? ("good" as const) : undefined,
    },
  ];
}

const WIDE = "(min-width: 1280px)";

export function Dashboard({ initialJobId }: { initialJobId: string | null }) {
  const [data, setData] = useState<Data>({ rows: [], payments: [], loaded: false, online: true, at: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId);

  // A link to another job (/dashboard?job=…) opens it, even when this page was already open.
  const [linkedId, setLinkedId] = useState(initialJobId);
  if (initialJobId !== linkedId) {
    setLinkedId(initialJobId);
    if (initialJobId) setSelectedId(initialJobId);
  }

  const rowsRef = useRef<JobRow[]>([]);
  const ledgerRef = useRef<{ payments: Payment[]; signature: string; polls: number }>({ payments: [], signature: "", polls: 0 });
  const seq = useRef({ started: 0, applied: 0, running: 0 });

  const load = useCallback(async () => {
    const mine = ++seq.current.started;
    seq.current.running++;
    try {
      const res = await fetch("/api/jobs", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`jobs ${res.status}`);
      const { jobs } = (await res.json()) as { jobs: Job[] };
      const ledger = ledgerRef.current;
      const sig = signature(jobs);
      if (sig !== ledger.signature || ++ledger.polls >= 10) {
        const pay = await fetch("/api/payments", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (pay.ok) {
          ledger.payments = ((await pay.json()) as { payments: Payment[] }).payments;
          ledger.signature = sig;
          ledger.polls = 0;
        }
      }
      if (mine < seq.current.applied) return;
      seq.current.applied = mine;
      const rows = buildRows(jobs, ledger.payments, rowsRef.current);
      rowsRef.current = rows;
      setData({ rows, payments: ledger.payments, loaded: true, online: true, at: Date.now() });
    } catch {
      if (mine >= seq.current.applied) setData((d) => ({ ...d, online: false }));
    } finally {
      seq.current.running--;
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && seq.current.running === 0) void load();
    };
    const first = setTimeout(load, 0);
    const timer = setInterval(refresh, 3000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    // The address bar follows the open job, so a refresh or a shared link opens it again.
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("job", id);
    else url.searchParams.delete("job");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const selected = data.rows.find((j) => j.id === selectedId) ?? null;
  const stats = useMemo(() => ownerStats(data.rows, data.payments, data.at), [data]);

  // On smaller screens the job opens as a sheet over the list: focus it, and Escape closes it.
  const closeButton = useRef<HTMLButtonElement>(null);
  const open = selected !== null;
  useEffect(() => {
    if (!open || window.matchMedia(WIDE).matches) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !window.matchMedia(WIDE).matches) select(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, select]);

  // The briefing only needs to change when a call arrives or a job changes state, not on every live update.
  const nightKey = data.loaded ? data.rows.map((j) => `${j.id}:${j.status}:${j.tech_status ?? ""}`).join("|") : "";

  return (
    <div className="flex flex-col gap-6">
      {data.loaded && <GettingStarted jobs={data.rows} />}
      {data.loaded && data.rows.length > 0 && <OvernightBriefing changeKey={nightKey} />}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatTile key={s.label} label={s.label} value={s.value} note={s.note} icon={s.icon} tone={s.tone} loading={!data.loaded} />
        ))}
      </div>

      <div className={selected ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]" : "grid items-start gap-6"}>
        <JobsGrid rows={data.rows} loaded={data.loaded} online={data.online} selectedId={selectedId} onSelect={select} onReload={load} />

        {selected && (
          <>
            <div aria-hidden className="fixed inset-0 z-40 bg-ink-950/30 xl:hidden" onClick={() => select(null)} />
            <aside
              aria-label={`Job ${shortId(selected.id)}, ${selected.customer_name ?? "unknown caller"}`}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  select(null);
                }
              }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-[440px] overflow-y-auto overscroll-contain bg-background p-3 shadow-2xl sm:p-4 xl:sticky xl:inset-auto xl:top-6 xl:z-auto xl:max-h-[calc(100vh-3rem)] xl:w-auto xl:max-w-none xl:bg-transparent xl:p-0 xl:shadow-none"
            >
              <div className="mb-2 flex items-center justify-between gap-2 pl-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Job details</p>
                <button
                  ref={closeButton}
                  type="button"
                  onClick={() => select(null)}
                  aria-label="Close job details"
                  className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-200/70 hover:text-gray-900"
                >
                  <Glyph name="close" className="h-4 w-4" />
                </button>
              </div>
              <JobPanel key={selected.id} job={selected} onChanged={load} />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
