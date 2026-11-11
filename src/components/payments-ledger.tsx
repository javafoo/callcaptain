"use client";

import type {
  CellKeyDownEvent,
  ColDef,
  FullWidthCellKeyDownEvent,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  IRowNode,
  ModelUpdatedEvent,
  ProcessCellForExportParams,
  ValueGetterParams,
} from "ag-grid-community";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Job } from "@/lib/db";
import { dollars, shortId } from "@/lib/format";
import type { Payment, PaymentKind } from "@/lib/ledger";
import { Blank, GridOverlay, MethodGlyph, SampleBadge } from "./grid-cells";
import { clockTime, csvDollars, dayLabel, fullTime, gridHeight, isoDay, isoMinute, plural } from "./grid-format";
import { KIND, KIND_ORDER, RANGES, holdAmounts, kindLabel, movedCents, openHolds, paypalStatus, prettyMethod, rangeStart, type RangeId } from "./grid-ledger";
import { contentWidth, hiddenColumns, useMeasuredWidth, useReducedMotion, type ColumnSpec } from "./grid-responsive";
import { LEDGER_ROW_HEIGHT, ledgerTheme } from "./grid-theme";
import { usePreference } from "./grid-storage";
import { ColumnsMenu, EmptyState, ExportButton, Glyph, LiveBadge, SearchBox, StatTile, TestCallLink } from "./grid-toolbar";
import { SampleNightButton } from "./sample-night";
import { Card, cx } from "./ui";

/**
 * Every PayPal money movement in the workspace (holds placed, charged or released, cards saved,
 * charged or removed, trip fees, balances, refunds) in AG Grid, with what it adds up to, filters,
 * and a CSV for the bookkeeper.
 */

type LedgerRow = Payment & {
  /** From "Load a sample night" (fictional caller, real sandbox payment). */
  sample: boolean;
  /** For "Hold released": the hold it released. */
  released_cents: number | null;
};

type Totals = { count: number; netCents: number };
type TotalsRow = { id: "__totals"; totals: Totals };

function totalsOf(node: IRowNode | null | undefined, data: unknown): Totals | null {
  return node?.rowPinned ? ((data as TotalsRow | undefined)?.totals ?? null) : null;
}

type GridContext = { copy: (text: string) => void };

/** Default visibility by grid width (see jobs-grid.tsx). PayPal's status mostly repeats the type, so it goes first. */
const LEDGER_SPECS: ColumnSpec[] = [
  { id: "date", label: "Date", showFrom: 0, locked: true },
  { id: "kind", label: "Type", showFrom: 0, locked: true },
  { id: "amount", label: "Amount", showFrom: 0, locked: true },
  { id: "customer", label: "Customer", showFrom: 496 },
  { id: "job", label: "Job #", showFrom: 580 },
  { id: "method", label: "Method", showFrom: 720 },
  { id: "paypal", label: "PayPal ID", showFrom: 888 },
  { id: "note", label: "Note", showFrom: 1016 },
  { id: "status", label: "Status", showFrom: 1128 },
];

const COLUMNS_KEY = "cc.ledger.columns";

const parsePicked = (v: unknown): Record<string, boolean> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, b]) => typeof b === "boolean")) : null;

const EXPORT_COLUMNS = ["date", "customer", "job", "kind", "method", "amount", "held", "status", "paypal", "order", "note", "jobId", "sample"];

// ---- Cells ---------------------------------------------------------------------------------

function DateCell({ value, valueFormatted, node }: CustomCellRendererProps<LedgerRow, string | number>) {
  if (node.rowPinned) {
    return (
      <div className="flex h-full flex-col justify-center leading-tight">
        <span className="text-gray-900">Total</span>
        <span className="text-xs font-normal text-gray-500">{plural(Number(value) || 0, "entry", "entries")}</span>
      </div>
    );
  }
  if (typeof value !== "string") return null;
  return (
    <div className="flex h-full flex-col justify-center leading-tight">
      <span className="tabular-nums text-gray-900">{clockTime(value)}</span>
      <span className="text-xs text-gray-500">{valueFormatted}</span>
    </div>
  );
}

function CustomerCell({ data, node }: CustomCellRendererProps<LedgerRow>) {
  if (node.rowPinned || !data) return null;
  return (
    <div className="flex h-full min-w-0 flex-col items-start justify-center gap-0.5 leading-tight">
      <span className={cx("max-w-full truncate", data.customer_name ? "font-medium text-gray-900" : "text-gray-500")}>{data.customer_name ?? "Unknown caller"}</span>
      {data.sample && <SampleBadge />}
    </div>
  );
}

function JobLinkCell({ value, node }: CustomCellRendererProps<LedgerRow, string>) {
  if (node.rowPinned || !value) return null;
  return (
    <Link href={`/dashboard?job=${value}`} prefetch={false} tabIndex={-1} className="font-mono text-xs font-medium text-brand-700 hover:text-brand-600 hover:underline">
      {shortId(value)}
    </Link>
  );
}

function KindCell({ value, node }: CustomCellRendererProps<LedgerRow, string>) {
  if (node.rowPinned || !value) return null;
  const k = KIND[value as PaymentKind];
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 ring-1 ring-inset",
        k?.pill ?? "bg-gray-100 text-gray-600 ring-gray-200",
      )}
    >
      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", k?.dot ?? "bg-gray-400")} />
      <span className="truncate">{kindLabel(value)}</span>
    </span>
  );
}

function MethodCell({ value, node }: CustomCellRendererProps<LedgerRow, string>) {
  if (node.rowPinned) return null;
  if (!value) return <Blank />;
  const keypad = /\s*\(keypad\)$/i.test(value);
  const email = value.match(/^PayPal \((.+)\)$/)?.[1] ?? null;
  const label = keypad ? value.replace(/\s*\(keypad\)$/i, "") : email ? "PayPal" : value;
  const kind = /venmo/i.test(label) ? "venmo" : /paypal/i.test(label) ? "paypal" : "card";
  return (
    <div className="flex h-full min-w-0 flex-col justify-center leading-tight">
      <span className="flex min-w-0 items-center gap-1.5">
        <MethodGlyph kind={kind} />
        <span className="truncate text-gray-800">{label}</span>
      </span>
      {(keypad || email) && <span className="truncate pl-[22px] text-xs text-gray-500">{keypad ? "Phone keypad" : email}</span>}
    </div>
  );
}

function AmountCell({ data, value, node }: CustomCellRendererProps<LedgerRow, number>) {
  const totals = totalsOf(node, data);
  if (totals) {
    return <span className="block text-right tabular-nums text-gray-900">{totals.netCents < 0 ? `−${dollars(-totals.netCents)}` : dollars(totals.netCents)}</span>;
  }
  if (!data) return null;
  if (data.kind === "hold") {
    return (
      <span className="block text-right tabular-nums">
        <span className="text-gray-900">{dollars(Math.abs(data.amount_cents))}</span> <span className="text-xs text-indigo-600">held</span>
      </span>
    );
  }
  if (data.kind === "refund") return <span className="block text-right font-medium tabular-nums text-violet-700">−{dollars(Math.abs(data.amount_cents))}</span>;
  if (!value) return <span className="block text-right tabular-nums text-gray-400">{dollars(0)}</span>;
  return <span className="block text-right font-medium tabular-nums text-gray-900">{dollars(Math.round(value * 100))}</span>;
}

function StatusCell({ value, node }: CustomCellRendererProps<LedgerRow, string>) {
  if (node.rowPinned || !value) return null;
  const s = paypalStatus(value);
  return (
    <span className="flex h-full items-center gap-1.5 text-gray-700">
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

function PayPalIdCell({ value, node, context }: CustomCellRendererProps<LedgerRow, string, GridContext>) {
  if (node.rowPinned) return null;
  if (!value) return <Blank />;
  return (
    <div className="flex h-full min-w-0 items-center">
      <button
        type="button"
        tabIndex={-1}
        onClick={() => context.copy(value)}
        title="Copy PayPal ID"
        className="group inline-flex max-w-full items-center gap-1.5 rounded font-mono text-xs leading-5 text-gray-600 hover:text-gray-900"
      >
        <span className="truncate">{value}</span>
        <Glyph name="copy" className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-600" />
      </button>
    </div>
  );
}

// ---- Columns -------------------------------------------------------------------------------

const nothing = () => "";

const kindRank = (k: string) => {
  const i = KIND_ORDER.indexOf(k as PaymentKind);
  return i < 0 ? KIND_ORDER.length : i;
};

function amountValue(p: ValueGetterParams<LedgerRow>): number | null {
  const totals = totalsOf(p.node, p.data);
  if (totals) return totals.netCents / 100;
  return p.data ? movedCents(p.data) / 100 : null;
}

function ledgerColumns(hidden: ReadonlySet<string>): ColDef<LedgerRow>[] {
  const col = (def: ColDef<LedgerRow> & { colId: string }): ColDef<LedgerRow> => ({ ...def, hide: hidden.has(def.colId) });
  return [
    col({
      colId: "date",
      headerName: "Date",
      // The totals row counts the movements in view here.
      valueGetter: (p) => totalsOf(p.node, p.data)?.count ?? p.data?.created_at ?? null,
      initialWidth: 96,
      minWidth: 92,
      initialSort: "desc",
      sortingOrder: ["desc", "asc"],
      valueFormatter: (p) => (typeof p.value === "string" && !p.node?.rowPinned ? dayLabel(p.value, Date.now()) : ""),
      cellRenderer: DateCell,
      tooltipValueGetter: (p) => (typeof p.value === "string" && !p.node?.rowPinned ? fullTime(p.value) : undefined),
      getQuickFilterText: nothing,
    }),
    col({
      colId: "customer",
      field: "customer_name",
      headerName: "Customer",
      initialFlex: 1,
      minWidth: 132,
      cellRenderer: CustomerCell,
      getQuickFilterText: (p) => p.value ?? "",
    }),
    col({
      colId: "job",
      field: "job_id",
      headerName: "Job #",
      headerTooltip: "Opens the job in Jobs.",
      initialWidth: 84,
      minWidth: 76,
      cellRenderer: JobLinkCell,
      getQuickFilterText: (p) => (p.value ? shortId(p.value) : ""),
    }),
    col({
      colId: "kind",
      field: "kind",
      headerName: "Type",
      // On a phone (no room for Customer) it flexes so Date, Type and Amount fit; long labels shorten there.
      ...(hidden.has("customer") ? { flex: 1, minWidth: 116, maxWidth: 196 } : { flex: null, width: 168, minWidth: 140 }),
      cellRenderer: KindCell,
      comparator: (a: string, b: string) => kindRank(a) - kindRank(b),
      getQuickFilterText: (p) => (p.value ? kindLabel(p.value) : ""),
    }),
    col({
      colId: "method",
      headerName: "Method",
      initialWidth: 140,
      minWidth: 124,
      valueGetter: (p) => prettyMethod(p.data?.method),
      cellRenderer: MethodCell,
    }),
    col({
      colId: "amount",
      headerName: "Amount",
      headerTooltip: "Money that moved: charges add, refunds subtract. Holds and saved cards move nothing.",
      type: "rightAligned",
      initialWidth: 96,
      minWidth: 92,
      valueGetter: amountValue,
      cellRenderer: AmountCell,
      tooltipValueGetter: (p) =>
        p.data?.kind === "hold_void" && p.data.released_cents
          ? `Released the ${dollars(p.data.released_cents)} hold. Nothing charged.`
          : p.data?.kind === "hold"
            ? "Authorized, not charged."
            : undefined,
      getQuickFilterText: nothing,
    }),
    col({
      colId: "status",
      field: "status",
      headerName: "Status",
      initialWidth: 112,
      minWidth: 100,
      cellRenderer: StatusCell,
      getQuickFilterText: (p) => paypalStatus(p.value).label,
    }),
    col({
      colId: "paypal",
      field: "paypal_id",
      headerName: "PayPal ID",
      headerTooltip: "The PayPal authorization, capture, refund or saved-card ID. Click to copy.",
      initialWidth: 168,
      minWidth: 150,
      cellRenderer: PayPalIdCell,
    }),
    col({
      colId: "note",
      field: "note",
      headerName: "Note",
      initialFlex: 1.3,
      minWidth: 128,
      cellClass: "text-gray-500",
      tooltipField: "note",
    }),
    // Only in the CSV export.
    {
      colId: "held",
      headerName: "Held",
      hide: true,
      lockVisible: true,
      valueGetter: (p) => (p.data?.kind === "hold" ? Math.abs(p.data.amount_cents) / 100 : null),
      getQuickFilterText: nothing,
    },
    { colId: "order", field: "paypal_order_id", headerName: "PayPal order ID", hide: true, lockVisible: true },
    { colId: "jobId", field: "job_id", headerName: "Job ID", hide: true, lockVisible: true, getQuickFilterText: nothing },
    { colId: "sample", field: "sample", headerName: "Sample", hide: true, lockVisible: true, getQuickFilterText: nothing },
  ];
}

const DEFAULT_COL: ColDef<LedgerRow> = { sortable: true, resizable: true, suppressHeaderMenuButton: true };
const LOADING_ROWS = { rowCount: 6 };
const rowId = (p: GetRowIdParams<LedgerRow>) => p.data.id;
const leaveGrid = () => false as const;

function exportCell(p: ProcessCellForExportParams): string {
  const v = p.value;
  switch (p.column.getColId()) {
    case "date":
      return isoMinute(v);
    case "job":
      return v ? shortId(v) : "";
    case "kind":
      return v ? kindLabel(v) : "";
    case "amount":
    case "held":
      return csvDollars(v);
    case "status":
      return paypalStatus(v).label;
    case "sample":
      return v ? "Sample" : "";
    default:
      return v == null ? "" : String(v);
  }
}

/** Ledger rows never change once written, so a row seen before keeps its object between refreshes. */
function buildRows(payments: Payment[], samples: ReadonlySet<string>, previous: LedgerRow[]): LedgerRow[] {
  const holds = holdAmounts(payments);
  const before = new Map(previous.map((r) => [r.id, r]));
  const rows = payments.map((p) => {
    const sample = samples.has(p.job_id);
    const released = p.kind === "hold_void" ? (holds.get(p.job_id) ?? null) : null;
    const old = before.get(p.id);
    if (old && old.status === p.status && old.created_at === p.created_at && old.customer_name === p.customer_name && old.sample === sample && old.released_cents === released) {
      return old;
    }
    return { ...p, sample, released_cents: released };
  });
  return rows.length === previous.length && rows.every((r, i) => r === previous[i]) ? previous : rows;
}

type Data = { rows: LedgerRow[]; loaded: boolean; online: boolean; at: number; hasSamples: boolean };

export function PaymentsLedger() {
  const router = useRouter();
  const apiRef = useRef<GridApi<LedgerRow> | null>(null);
  const [data, setData] = useState<Data>({ rows: [], loaded: false, online: true, at: 0, hasSamples: false });
  const [range, setRange] = useState<RangeId>("all");
  const [kinds, setKinds] = useState<PaymentKind[]>([]);
  const [search, setSearch] = useState("");

  const rowsRef = useRef<LedgerRow[]>([]);
  const jobsRef = useRef<{ signature: string; samples: Set<string> }>({ signature: "", samples: new Set() });
  const seq = useRef({ started: 0, applied: 0, running: 0 });

  const load = useCallback(async () => {
    const mine = ++seq.current.started;
    seq.current.running++;
    try {
      const res = await fetch("/api/payments", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`payments ${res.status}`);
      const { payments } = (await res.json()) as { payments: Payment[] };
      // Which movements belong to sample jobs: ask the jobs list again only when the ledger changed.
      const jobs = jobsRef.current;
      const sig = `${payments.length}:${payments[0]?.id ?? ""}:${payments[0]?.created_at ?? ""}`;
      if (sig !== jobs.signature) {
        const jr = await fetch("/api/jobs", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (jr.ok) {
          const list = ((await jr.json()) as { jobs: Job[] }).jobs;
          jobs.samples = new Set(list.filter((j) => j.sample).map((j) => j.id));
          jobs.signature = sig;
        }
      }
      if (mine < seq.current.applied) return;
      seq.current.applied = mine;
      const rows = buildRows(payments, jobs.samples, rowsRef.current);
      rowsRef.current = rows;
      setData({ rows, loaded: true, online: true, at: Date.now(), hasSamples: jobs.samples.size > 0 });
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
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  // "Copied" feedback, announced to screen readers too.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const copy = useCallback((text: string) => {
    const done = (message: string) => {
      setToast(message);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 2400);
    };
    // The clipboard API only exists on secure pages (https or localhost).
    const write = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("clipboard unavailable"));
    write.then(
      () => done(`Copied PayPal ID ${text}`),
      () => done("Couldn't copy. Select the ID and copy it instead."),
    );
  }, []);
  const context = useMemo<GridContext>(() => ({ copy }), [copy]);

  // What the tiles and the type chips count: the movements in the date range.
  const inRange = useMemo(() => {
    const start = rangeStart(range, data.at);
    return data.rows.filter((r) => Date.parse(r.created_at) >= start);
  }, [data, range]);

  const summary = useMemo(() => {
    let collected = 0;
    let refunded = 0;
    let charges = 0;
    let refunds = 0;
    for (const r of inRange) {
      const moved = movedCents(r);
      if (moved > 0) {
        collected += moved;
        charges += 1;
      } else if (moved < 0) {
        refunded -= moved;
        refunds += 1;
      }
    }
    return { collected, refunded, charges, refunds, held: openHolds(data.rows) };
  }, [inRange, data.rows]);

  const kindCounts = useMemo(() => {
    const counts = new Map<PaymentKind, number>();
    for (const r of inRange) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    return counts;
  }, [inRange]);

  const rangeNote = RANGES.find((r) => r.id === range)?.note ?? "";

  const [picked, setPicked] = usePreference<Record<string, boolean>>(COLUMNS_KEY, parsePicked, {});
  const [measure, width] = useMeasuredWidth(() => contentWidth(window.innerWidth));
  const reducedMotion = useReducedMotion();
  const hiddenKey = hiddenColumns(LEDGER_SPECS, width, picked).join(",");
  const columnDefs = useMemo(() => ledgerColumns(new Set(hiddenKey.split(","))), [hiddenKey]);
  const menuColumns = useMemo(() => {
    const hidden = new Set(hiddenKey.split(","));
    return LEDGER_SPECS.filter((s) => !s.locked).map((s) => ({ id: s.id, label: s.label, visible: !hidden.has(s.id) }));
  }, [hiddenKey]);

  const [totals, setTotals] = useState<Totals | null>(null);
  const pinned = useMemo<TotalsRow[]>(() => (totals && totals.count > 0 ? [{ id: "__totals", totals }] : []), [totals]);

  const overlay = useMemo(() => {
    const q = search.trim();
    const what = kinds.length ? kinds.map((k) => KIND[k].label.toLowerCase()).join(" or ") : "PayPal activity";
    const when = range === "all" ? "" : range === "today" ? " today" : ` in the ${rangeNote.toLowerCase()}`;
    const text = q ? { title: `Nothing matches “${q}”.`, body: "Try a name, job number, PayPal ID or card." } : { title: `No ${what}${when}.`, body: "Pick a longer date range or another type." };
    return { messages: { noRows: text, noMatchingRows: text } };
  }, [search, kinds, range, rangeNote]);

  // Grid callbacks read the newest values from here (see the note in jobs-grid.tsx).
  const latest = useRef({ created: 0, range, kinds, rows: data.rows, columnDefs, loading: !data.loaded, search, pinned, overlay, router, copy });
  useLayoutEffect(() => {
    Object.assign(latest.current, { range, kinds, rows: data.rows, columnDefs, loading: !data.loaded, search, pinned, overlay, router, copy });
  });

  useLayoutEffect(() => {
    apiRef.current?.onFilterChanged();
  }, [range, kinds]);

  const isExternalFilterPresent = useCallback(() => latest.current.range !== "all" || latest.current.kinds.length > 0, []);
  const doesExternalFilterPass = useCallback((node: IRowNode<LedgerRow>) => {
    const d = node.data;
    if (!d) return false;
    const { kinds: only, range: within } = latest.current;
    if (only.length && !only.includes(d.kind)) return false;
    return Date.parse(d.created_at) >= rangeStart(within, Date.now());
  }, []);

  const onGridReady = useCallback((e: GridReadyEvent<LedgerRow>) => {
    apiRef.current = e.api;
    const l = latest.current;
    if (l.created++ > 0) {
      e.api.updateGridOptions({
        rowData: l.rows,
        columnDefs: l.columnDefs,
        loading: l.loading,
        quickFilterText: l.search,
        pinnedBottomRowData: l.pinned,
        overlayComponentParams: l.overlay,
      });
    }
    e.api.onFilterChanged();
  }, []);

  const onGridPreDestroyed = useCallback(() => {
    apiRef.current = null;
  }, []);

  const onModelUpdated = useCallback((e: ModelUpdatedEvent<LedgerRow>) => {
    const t: Totals = { count: 0, netCents: 0 };
    e.api.forEachNodeAfterFilter((n) => {
      const d = n.data;
      if (!d) return;
      t.count += 1;
      t.netCents += movedCents(d);
    });
    setTotals((prev) => (prev && prev.count === t.count && prev.netCents === t.netCents ? prev : t));
  }, []);

  const onCellKeyDown = useCallback((e: CellKeyDownEvent<LedgerRow> | FullWidthCellKeyDownEvent<LedgerRow>) => {
    const key = (e.event as KeyboardEvent | null | undefined)?.key;
    if (key !== "Enter" || !e.data || e.node.rowPinned || !("column" in e)) return;
    const column = e.column.getColId();
    if (column === "job") latest.current.router.push(`/dashboard?job=${e.data.job_id}`);
    if (column === "paypal" && e.data.paypal_id) latest.current.copy(e.data.paypal_id);
  }, []);

  const exportCsv = useCallback(() => {
    apiRef.current?.exportDataAsCsv({
      fileName: `call-captain-paypal-ledger-${range === "all" ? "all" : range}-${isoDay(new Date())}.csv`,
      columnKeys: EXPORT_COLUMNS,
      skipPinnedBottom: true,
      processCellCallback: exportCell,
    });
  }, [range]);

  const toggleKind = (k: PaymentKind) => setKinds((current) => (current.includes(k) ? current.filter((x) => x !== k) : [...current, k]));

  const empty = data.loaded && data.rows.length === 0;
  const inView = totals?.count ?? inRange.length;
  const height = gridHeight(data.loaded ? inView : LOADING_ROWS.rowCount, LEDGER_ROW_HEIGHT, data.loaded && inView > 0, 236, 680);
  const chipKinds = KIND_ORDER.filter((k) => (kindCounts.get(k) ?? 0) > 0 || kinds.includes(k));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Collected"
          value={dollars(summary.collected)}
          note={`${rangeNote} · ${plural(summary.charges, "charge")}, before refunds`}
          icon="dollar"
          tone={summary.collected ? "good" : "default"}
          loading={!data.loaded}
        />
        <StatTile
          label="Refunded"
          value={summary.refunded ? `−${dollars(summary.refunded)}` : dollars(0)}
          note={`${rangeNote} · ${plural(summary.refunds, "refund")}`}
          icon="clock"
          tone={summary.refunded ? "warn" : "default"}
          loading={!data.loaded}
        />
        <StatTile
          label="Net"
          value={summary.collected - summary.refunded < 0 ? `−${dollars(summary.refunded - summary.collected)}` : dollars(summary.collected - summary.refunded)}
          note={`${rangeNote}, after refunds`}
          icon="check"
          loading={!data.loaded}
        />
        <StatTile
          label="Held right now"
          value={dollars(summary.held.cents)}
          note={summary.held.count ? `${plural(summary.held.count, "open hold")}, not charged yet` : "No open holds"}
          icon="shield"
          loading={!data.loaded}
        />
      </div>

      <Card className="@container min-w-0">
        <div className="flex flex-col gap-3 px-4 pt-4 @lg:px-5 @4xl:flex-row @4xl:items-center @4xl:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-[15px] font-semibold text-gray-900">PayPal ledger</h2>
            <LiveBadge online={data.online} />
          </div>
          {!empty && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchBox className="w-full @lg:w-72" value={search} onChange={setSearch} label="Search payments" placeholder="Search name, job #, PayPal ID, card" />
              <ColumnsMenu
                columns={menuColumns}
                onToggle={(id, visible) => setPicked({ ...picked, [id]: visible })}
                onReset={() => {
                  setPicked({});
                  apiRef.current?.resetColumnState();
                }}
              />
              <ExportButton onClick={exportCsv} disabled={!data.loaded || inView === 0}>
                Export CSV<span className="hidden sm:inline"> for your bookkeeper</span>
              </ExportButton>
            </div>
          )}
        </div>

        {empty ? (
          <EmptyState
            icon="dollar"
            title="No PayPal activity yet"
            actions={
              <>
                <TestCallLink />
                {!data.hasSamples && <SampleNightButton loaded={false} onChange={load} />}
              </>
            }
          >
            Every hold your agent places shows up here, then every charge, release, trip fee, balance and refund, each with its PayPal ID. Export it for your bookkeeper
            any time.
          </EmptyState>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-3 border-b border-gray-200 px-4 pb-3 @lg:px-5 @3xl:flex-row @3xl:items-start">
              <div role="group" aria-label="Date range" className="inline-flex shrink-0 self-start rounded-lg bg-gray-100 p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={range === r.id}
                    onClick={() => setRange(r.id)}
                    className={cx(
                      "rounded-md px-3 py-1 text-sm font-medium transition",
                      range === r.id ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200" : "text-gray-600 hover:text-gray-900",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Filter by type" className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5 @3xl:flex-wrap @3xl:overflow-visible">
                <button
                  type="button"
                  aria-pressed={kinds.length === 0}
                  onClick={() => setKinds([])}
                  className={cx(
                    "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset transition",
                    kinds.length === 0 ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50",
                  )}
                >
                  All types <span className="tabular-nums opacity-70">{inRange.length}</span>
                </button>
                {chipKinds.map((k) => {
                  const on = kinds.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleKind(k)}
                      className={cx(
                        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset transition",
                        on ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50",
                      )}
                    >
                      <span className={cx("h-1.5 w-1.5 rounded-full", KIND[k].dot)} />
                      {KIND[k].label}
                      <span className="tabular-nums opacity-70">{kindCounts.get(k) ?? 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <section aria-label="PayPal movements" ref={measure} style={{ height }} className="overflow-hidden rounded-b-xl">
              <AgGridReact<LedgerRow>
                theme={ledgerTheme}
                rowData={data.rows}
                columnDefs={columnDefs}
                defaultColDef={DEFAULT_COL}
                getRowId={rowId}
                context={context}
                loading={!data.loaded}
                loadingRows={LOADING_ROWS}
                quickFilterText={search}
                cacheQuickFilter
                includeHiddenColumnsInQuickFilter
                isExternalFilterPresent={isExternalFilterPresent}
                doesExternalFilterPass={doesExternalFilterPass}
                pinnedBottomRowData={pinned}
                animateRows={!reducedMotion}
                enableCellTextSelection
                tooltipShowDelay={400}
                overlayComponent={GridOverlay}
                overlayComponentParams={overlay}
                tabToNextCell={leaveGrid}
                tabToNextHeader={leaveGrid}
                onGridReady={onGridReady}
                onGridPreDestroyed={onGridPreDestroyed}
                onModelUpdated={onModelUpdated}
                onCellKeyDown={onCellKeyDown}
              />
            </section>
          </>
        )}
      </Card>

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && <span className="rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</span>}
      </div>
    </div>
  );
}
