"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job } from "@/lib/db";
import { dollars, shortId } from "@/lib/format";
import { StatusPill } from "./status-pill";
import { Button, Card, CardHeader, Icon, cx, inputClass } from "./ui";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#039855",
  backgroundColor: "#ffffff",
  borderColor: "#eaecf0",
  browserColorScheme: "light",
  fontFamily: "inherit",
  fontSize: 13,
  foregroundColor: "#101828",
  headerBackgroundColor: "#f9fafb",
  headerFontWeight: 500,
  headerTextColor: "#667085",
  rowHoverColor: "#f9fafb",
  selectedRowBackgroundColor: "#ecfdf3",
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  rowHeight: 52,
  headerHeight: 40,
  cellHorizontalPadding: 16,
});

const HELD = new Set(["hold_placed", "dispatched"]);

function StatusCell({ value }: ICellRendererParams<Job, string>) {
  return value ? <StatusPill status={value} /> : null;
}

function CustomerCell({ data }: ICellRendererParams<Job>) {
  if (!data) return null;
  return (
    <div className="flex flex-col justify-center leading-tight">
      <span className="font-medium text-gray-900">{data.customer_name ?? "Unknown caller"}</span>
      <span className="truncate text-xs text-gray-500">{data.service_address ?? "No address"}</span>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
    const secured = jobs.filter((j) => j.authorization_id).length;
    const answered = jobs.length;
    return [
      { label: "Calls answered", value: String(answered), note: "after hours", icon: "phone" as const },
      { label: "Visits secured", value: String(secured), note: answered ? `${Math.round((secured / answered) * 100)}% of calls` : "no calls yet", icon: "shield" as const },
      { label: "Held right now", value: dollars(jobs.filter((j) => HELD.has(j.status)).reduce((s, j) => s + j.fee_cents, 0)), note: "not charged yet", icon: "clock" as const },
      { label: "Collected", value: dollars(jobs.reduce((s, j) => s + (j.captured_cents ?? 0), 0)), note: "through PayPal", icon: "dollar" as const },
    ];
  }, [jobs]);

  const columns = useMemo<ColDef<Job>[]>(
    () => [
      { field: "id", headerName: "Job", width: 90, valueFormatter: (p) => (p.value ? shortId(p.value) : ""), cellClass: "font-mono text-gray-500" },
      { field: "created_at", headerName: "Received", width: 150, valueFormatter: (p) => (p.value ? when(p.value) : ""), sort: "desc" },
      { field: "customer_name", headerName: "Customer", flex: 1.2, minWidth: 180, cellRenderer: CustomerCell },
      { field: "issue", headerName: "Problem", flex: 2, minWidth: 220, valueFormatter: (p) => p.value ?? "", tooltipField: "issue" },
      { field: "status", headerName: "Status", width: 170, cellRenderer: StatusCell },
      { field: "captured_cents", headerName: "Collected", width: 120, type: "rightAligned", valueFormatter: (p) => dollars(p.value ?? 0) },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{s.label}</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-200">
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.note}</p>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <CardHeader title="All jobs" subtitle="Every call the agent took, newest first. Click a row to open it." />
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
                if (initialJobId) e.api.getRowNode(initialJobId)?.setSelected(true);
              }}
              overlayNoRowsTemplate="No calls yet. Place one from Live call."
            />
          </div>
        </Card>
        <div className="2xl:sticky 2xl:top-6">
          <JobPanel job={selected} onChanged={load} />
        </div>
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
      <Card className="flex min-h-64 flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-gray-400 ring-1 ring-gray-200">
          <Icon name="jobs" className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-gray-900">No job selected</p>
        <p className="text-sm text-gray-500">Pick a job to see the call, the AI ticket and every PayPal step.</p>
      </Card>
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
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">Job {shortId(job.id)}</p>
            <h2 className="truncate text-lg font-semibold text-gray-900">{job.customer_name ?? "Unknown caller"}</h2>
          </div>
          <StatusPill status={job.status} />
        </div>
        <div className="mt-3 space-y-1.5 text-sm text-gray-600">
          <p className="flex gap-2">
            <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            {job.service_address ?? "No address"} {job.zip && !job.service_address?.includes(job.zip) ? job.zip : ""}
          </p>
          <p className="flex gap-2">
            <Icon name="wrench" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            {job.issue ?? "No problem described"}
          </p>
          {job.tech_name && (
            <p className="flex gap-2">
              <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              {job.tech_name}, {job.eta}
            </p>
          )}
        </div>
      </div>

      {summary && (
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Icon name="sparkle" className="h-3.5 w-3.5 text-brand-600" /> AI ticket for the tech
          </p>
          <p className="text-sm text-gray-800">{summary.summary}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {summary.likely_work && (<><dt className="text-gray-500">Likely work</dt><dd className="text-gray-800">{summary.likely_work}</dd></>)}
            {summary.safety_steps_taken && (<><dt className="text-gray-500">Safety</dt><dd className="text-gray-800">{summary.safety_steps_taken}</dd></>)}
            {summary.language && (<><dt className="text-gray-500">Language</dt><dd className="text-gray-800">{summary.language}</dd></>)}
          </dl>
        </div>
      )}

      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">Service-call hold</span>
          <span className="tabular-nums text-gray-900">{dollars(job.fee_cents)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-gray-500">Collected</span>
          <span className="tabular-nums font-semibold text-gray-900">{dollars(job.captured_cents)}</span>
        </div>

        {held && (
          <div className="mt-4 space-y-3">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void act("complete", { finalDollars });
              }}
            >
              <label className="text-sm font-medium text-gray-700" htmlFor="final">
                Job finished? Enter the final bill
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    id="final"
                    inputMode="decimal"
                    value={finalDollars}
                    onChange={(e) => setFinalDollars(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="1,840"
                    className={cx(inputClass, "pl-7")}
                  />
                </div>
                <Button disabled={!finalDollars || busy !== null}>{busy === "complete" ? "Charging…" : "Charge"}</Button>
              </div>
              <p className="text-xs text-gray-500">
                Up to {dollars(job.fee_cents)} comes out of the hold and the rest is released. A larger bill sends the balance as a PayPal link with Pay Later.
              </p>
            </form>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => void act("cancel")} disabled={busy !== null}>
                {busy === "cancel" ? "Working…" : "Customer cancelled"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void act("release")} disabled={busy !== null}>
                {busy === "release" ? "Working…" : "Release hold"}
              </Button>
            </div>
          </div>
        )}

        {job.status === "balance_due" && (
          <div className="mt-4 rounded-lg bg-orange-50 p-3 text-sm ring-1 ring-orange-200">
            <p className="font-medium text-gray-900">{dollars(job.balance_cents)} balance sent to the customer</p>
            <a href={`/pay/${job.id}`} target="_blank" className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-600">
              Open the customer&apos;s invoice <Icon name="external" className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
      </div>

      <div className="px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Activity</p>
        <ol className="relative space-y-3.5 border-l border-gray-200 pl-4">
          {timeline.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-white" />
              <p className="text-sm text-gray-800">{e.text}</p>
              <p className="text-xs text-gray-400">{new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
            </li>
          ))}
        </ol>
        {(job.order_id || job.authorization_id) && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-gray-50 p-3 font-mono text-[11px] text-gray-500">
            {job.order_id && (<><dt>PayPal order</dt><dd className="truncate">{job.order_id}</dd></>)}
            {job.authorization_id && (<><dt>Authorization</dt><dd className="truncate">{job.authorization_id}</dd></>)}
            {job.balance_order_id && (<><dt>Balance order</dt><dd className="truncate">{job.balance_order_id}</dd></>)}
            {job.authorization_expires && (<><dt>Hold valid to</dt><dd>{new Date(job.authorization_expires).toLocaleDateString()}</dd></>)}
          </dl>
        )}
      </div>
    </Card>
  );
}
