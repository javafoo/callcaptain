"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job } from "@/lib/db";
import { STATUS_LABEL, STATUS_TONE, dollars } from "@/lib/format";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#2563eb",
  borderRadius: 10,
  headerBackgroundColor: "#f8fafc",
  fontFamily: "inherit",
  rowHoverColor: "#eff6ff",
  selectedRowBackgroundColor: "#dbeafe",
  wrapperBorderRadius: 16,
});

const HELD = new Set(["hold_placed", "dispatched"]);

function StatusCell({ value }: ICellRendererParams<Job, string>) {
  if (!value) return null;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[value]}`}>{STATUS_LABEL[value]}</span>;
}

function time(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Dashboard({ initialJobId }: { initialJobId: string | null }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/jobs", { cache: "no-store" });
    if (res.ok) setJobs(((await res.json()) as { jobs: Job[] }).jobs);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const holds = jobs.filter((j) => j.authorization_id);
    return {
      calls: jobs.length,
      secured: holds.length,
      heldNow: jobs.filter((j) => HELD.has(j.status)).reduce((s, j) => s + j.fee_cents, 0),
      collected: jobs.reduce((s, j) => s + (j.captured_cents ?? 0), 0),
      released: jobs.filter((j) => j.status === "released").length,
    };
  }, [jobs]);

  const columns = useMemo<ColDef<Job>[]>(
    () => [
      { field: "created_at", headerName: "Call", valueFormatter: (p) => (p.value ? time(p.value) : ""), width: 140, sort: "desc" },
      { field: "customer_name", headerName: "Customer", width: 120, valueFormatter: (p) => p.value ?? "Unknown" },
      { field: "issue", headerName: "Problem", flex: 2, minWidth: 200, valueFormatter: (p) => p.value ?? "" },
      { field: "urgency", headerName: "Urgency", width: 110 },
      { field: "status", headerName: "Status", width: 190, cellRenderer: StatusCell },
      {
        field: "hold_method",
        headerName: "Held via",
        width: 120,
        valueFormatter: (p) => (p.data?.authorization_id ? (p.value === "keypad" ? `Keypad •••• ${p.data.card_last4 ?? ""}` : "PayPal") : ""),
      },
      { field: "captured_cents", headerName: "Charged", width: 105, type: "rightAligned", valueFormatter: (p) => (p.value ? dollars(p.value) : "$0") },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Calls answered", String(stats.calls)],
          ["Visits secured", String(stats.secured)],
          ["Held right now", dollars(stats.heldNow)],
          ["Collected", dollars(stats.collected)],
          ["Released, $0", String(stats.released)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="h-[560px]">
          <AgGridReact<Job>
            theme={theme}
            rowData={jobs}
            columnDefs={columns}
            getRowId={(p) => p.data.id}
            loading={!loaded}
            rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
            onRowClicked={(e) => e.data && setSelectedId(e.data.id)}
            onFirstDataRendered={(e) => {
              if (!initialJobId) return;
              e.api.getRowNode(initialJobId)?.setSelected(true);
            }}
            overlayNoRowsTemplate="No calls yet. Call the after-hours line from the Live demo tab."
          />
        </div>
        <JobPanel job={selected} onChanged={load} />
      </div>
    </div>
  );
}

function JobPanel({ job, onChanged }: { job: Job | null; onChanged: () => Promise<void> }) {
  const [finalDollars, setFinalDollars] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!job) {
    return (
      <aside className="flex h-full min-h-60 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Pick a job to see the call, the AI ticket and the PayPal trail.
      </aside>
    );
  }

  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/jobs/${job.id}/owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(out.error ?? "PayPal didn't accept that.");
    setBusy(null);
    setFinalDollars("");
    await onChanged();
  };

  const held = HELD.has(job.status);
  const summary = job.summary as Record<string, string> | null;
  const timeline = job.events.filter((e) => e.kind !== "caller" && e.kind !== "agent_said").slice().reverse();

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{job.customer_name ?? "Unknown caller"}</h2>
          <p className="text-sm text-slate-500">{job.service_address ?? "No address yet"}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[job.status]}`}>{STATUS_LABEL[job.status]}</span>
      </div>

      {summary && (
        <div className="rounded-xl bg-blue-50 p-3 text-sm text-slate-800 ring-1 ring-blue-100">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-800">AI ticket for {job.tech_name ?? "the tech"}</p>
          <p>{summary.summary}</p>
          {summary.likely_work && <p className="mt-1 text-slate-600">Likely work: {summary.likely_work}</p>}
          {summary.safety_steps_taken && <p className="mt-1 text-slate-600">Safety: {summary.safety_steps_taken}</p>}
        </div>
      )}

      {held && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">Job finished? Charge the final bill</p>
          <p className="text-xs text-slate-500">
            {dollars(job.fee_cents)} is held. Up to that amount is captured from the hold and the rest released. A bigger bill captures the hold and sends the balance as a PayPal link with Pay Later.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act("complete", { finalDollars });
            }}
          >
            <div className="flex flex-1 items-center rounded-lg border border-slate-300 px-2 focus-within:ring-2 focus-within:ring-blue-500">
              <span className="text-slate-400">$</span>
              <input
                inputMode="decimal"
                value={finalDollars}
                onChange={(e) => setFinalDollars(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="1,840.00"
                className="w-full px-1 py-2 text-sm outline-none"
                aria-label="Final bill in dollars"
              />
            </div>
            <button disabled={!finalDollars || busy !== null} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              {busy === "complete" ? "Charging…" : "Charge"}
            </button>
          </form>
          <div className="flex gap-2">
            <button onClick={() => void act("cancel")} disabled={busy !== null} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy === "cancel" ? "Working…" : "Customer cancelled"}
            </button>
            <button onClick={() => void act("release")} disabled={busy !== null} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy === "release" ? "Working…" : "Release hold"}
            </button>
          </div>
        </div>
      )}

      {job.status === "balance_due" && (
        <div className="rounded-xl bg-orange-50 p-3 text-sm ring-1 ring-orange-200">
          <p className="font-medium text-slate-900">{dollars(job.balance_cents)} balance sent to the customer</p>
          <a href={`/pay/${job.id}`} target="_blank" className="font-medium text-blue-700 hover:underline">
            Open the customer&apos;s payment page →
          </a>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">PayPal trail</p>
        <ul className="space-y-2 text-sm">
          {timeline.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-14 shrink-0 text-xs tabular-nums text-slate-400">{new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
              <span className="text-slate-700">{e.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-slate-100 pt-3 font-mono text-[11px] text-slate-500">
        {job.order_id && (<><dt>order</dt><dd className="truncate">{job.order_id}</dd></>)}
        {job.authorization_id && (<><dt>authorization</dt><dd className="truncate">{job.authorization_id}</dd></>)}
        {job.balance_order_id && (<><dt>balance order</dt><dd className="truncate">{job.balance_order_id}</dd></>)}
        {job.authorization_expires && (<><dt>hold valid to</dt><dd>{new Date(job.authorization_expires).toLocaleDateString()}</dd></>)}
      </dl>
    </aside>
  );
}
