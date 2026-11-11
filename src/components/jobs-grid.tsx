"use client";

import type {
  CellKeyDownEvent,
  ColDef,
  ColumnState,
  FullWidthCellKeyDownEvent,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  IRowNode,
  ModelUpdatedEvent,
  ProcessCellForExportParams,
  RowDataUpdatedEvent,
  RowSelectionOptions,
  SelectionChangedEvent,
  StateUpdatedEvent,
  ValueGetterParams,
} from "ag-grid-community";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { STATUS_LABEL, dollars, shortId } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Blank, GridOverlay, MethodGlyph, SampleBadge } from "./grid-cells";
import { clockTime, csvDollars, dayLabel, fullTime, gridHeight, isoDay, isoMinute, plural } from "./grid-format";
import {
  JOB_TABS,
  STATUS_ORDER,
  TAB_IDS,
  TECH_STATUS,
  URGENCY,
  cardOnFile,
  collectedCents,
  heldCents,
  homeTab,
  inTab,
  isTabId,
  methodText,
  tabCounts,
  techText,
  type JobRow,
  type TabId,
} from "./grid-jobs";
import { contentWidth, hiddenColumns, useMeasuredWidth, useReducedMotion, type ColumnSpec } from "./grid-responsive";
import { readStored, usePreference, writeStored } from "./grid-storage";
import { JOB_ROW_HEIGHT, gridTheme } from "./grid-theme";
import { ColumnsMenu, EmptyState, ExportButton, LiveBadge, SearchBox, TestCallLink, useTabKeys } from "./grid-toolbar";
import { SampleNightButton } from "./sample-night";
import { StatusPill } from "./status-pill";
import { Card, Icon, cx } from "./ui";

/**
 * Every job in the workspace, live, in AG Grid (Community). Tabs and a quick search filter it;
 * statuses and amounts flash as a call moves along; new calls fade in; a pinned row totals what's
 * in view; the view exports to CSV; the tab and the column layout are remembered per browser.
 */

const TAB_KEY = "cc.jobs.tab";
const COLUMNS_KEY = "cc.jobs.columns";
const LAYOUT_KEY = "cc.jobs.layout";

/**
 * Default visibility by grid width, most important first: each column shows once the grid has
 * room for it and every column before it at their minimum widths. Customer and Status always show.
 */
const COLUMN_SPECS: ColumnSpec[] = [
  { id: "customer", label: "Customer", showFrom: 0, locked: true },
  { id: "status", label: "Status", showFrom: 0, locked: true },
  { id: "received", label: "Received", showFrom: 442 },
  { id: "secured", label: "Secured", showFrom: 542 },
  { id: "collected", label: "Collected", showFrom: 638 },
  { id: "problem", label: "Problem", showFrom: 818 },
  { id: "technician", label: "Technician", showFrom: 938 },
  { id: "method", label: "Payment method", showFrom: 1074 },
  { id: "refunded", label: "Refunded", showFrom: 1170 },
  { id: "channel", label: "Channel", showFrom: 1262 },
  { id: "job", label: "Job #", showFrom: 1334 },
];

/** What the CSV holds, in order: the visible columns plus the contact details behind them. */
const EXPORT_COLUMNS = ["job", "received", "customer", "phone", "address", "zip", "problem", "urgency", "status", "technician", "method", "secured", "collected", "refunded", "final", "channel", "sample", "jobId"];

type Totals = { count: number; heldCents: number; cards: number; collectedCents: number; refundedCents: number };
type TotalsRow = { id: "__totals"; totals: Totals };

/** The pinned bottom row carries totals for the rows in view instead of a job. */
function totalsOf(node: IRowNode | null | undefined, data: unknown): Totals | null {
  return node?.rowPinned ? ((data as TotalsRow | undefined)?.totals ?? null) : null;
}

// ---- Cells ---------------------------------------------------------------------------------

function ReceivedCell({ value, valueFormatted, node }: CustomCellRendererProps<JobRow, string>) {
  if (node.rowPinned || !value) return null;
  return (
    <div className="flex h-full flex-col justify-center leading-tight">
      <span className="tabular-nums text-gray-900">{clockTime(value)}</span>
      <span className="text-xs text-gray-500">{valueFormatted}</span>
    </div>
  );
}

function CustomerCell({ data, node, value }: CustomCellRendererProps<JobRow, string | number>) {
  if (node.rowPinned) return <div className="flex h-full items-center text-gray-900">Total · {plural(Number(value) || 0, "job")}</div>;
  if (!data) return null;
  const second = data.service_address ?? (data.callback_phone ? formatPhone(data.callback_phone) : "No address yet");
  return (
    <div className="flex h-full min-w-0 flex-col justify-center leading-tight">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cx("truncate font-medium", data.customer_name ? "text-gray-900" : "text-gray-500")}>{data.customer_name ?? "Unknown caller"}</span>
        {data.sample && <SampleBadge />}
      </span>
      <span className="truncate text-xs text-gray-500">{second}</span>
    </div>
  );
}

function ProblemCell({ data, node }: CustomCellRendererProps<JobRow>) {
  if (node.rowPinned || !data) return null;
  const urgency = data.urgency ? URGENCY[data.urgency] : null;
  return (
    <div className="flex h-full min-w-0 flex-col items-start justify-center gap-0.5">
      <span className={cx("max-w-full truncate leading-tight", data.issue ? "text-gray-800" : "text-gray-400")}>{data.issue ?? "Not described yet"}</span>
      {urgency && <span className={cx("rounded px-1.5 text-[11px] font-medium leading-4 ring-1 ring-inset", urgency.className)}>{urgency.label}</span>}
    </div>
  );
}

function StatusCell({ value, node, data }: CustomCellRendererProps<JobRow, string>) {
  if (node.rowPinned || !value || !data) return null;
  // A hold job keeps its status while the final bill waits on the customer's screen.
  const billSent = data.approval_requested_at && !data.approved_at && data.approval_cents ? data.approval_cents : null;
  return (
    <div className="flex h-full max-w-full flex-col items-start justify-center gap-0.5 overflow-hidden">
      <StatusPill status={value} />
      {billSent && <span className="max-w-full truncate pl-1 text-[11px] leading-4 text-amber-700">Bill sent: {dollars(billSent)}</span>}
    </div>
  );
}

function TechCell({ data, node }: CustomCellRendererProps<JobRow>) {
  if (node.rowPinned || !data) return null;
  if (!data.tech_name) {
    if (data.status === "scheduled" && data.eta) {
      return (
        <div className="flex h-full flex-col justify-center leading-tight">
          <span className="text-gray-800">Morning slot</span>
          <span className="truncate text-xs text-gray-500">{data.eta}</span>
        </div>
      );
    }
    return <Blank />;
  }
  const call = data.tech_status ? TECH_STATUS[data.tech_status] : null;
  return (
    <div className="flex h-full min-w-0 flex-col justify-center leading-tight">
      <span className="truncate font-medium text-gray-900">{data.tech_name}</span>
      {call ? (
        <span className={cx("flex items-center gap-1.5 text-xs", call.text)}>
          <span className={cx("h-1.5 w-1.5 rounded-full", call.dot, call.live && "motion-safe:animate-pulse")} />
          {call.label}
        </span>
      ) : data.status === "dispatched" && data.eta ? (
        <span className="truncate text-xs text-gray-500">ETA {data.eta}</span>
      ) : null}
    </div>
  );
}

function MethodCell({ data, node }: CustomCellRendererProps<JobRow>) {
  if (node.rowPinned || !data) return null;
  const m = data.method;
  if (!m) {
    if (data.status === "awaiting_hold" || data.status === "awaiting_card") return <span className="flex h-full items-center text-xs text-amber-700">Waiting for PayPal…</span>;
    return <Blank />;
  }
  return (
    <div className="flex h-full min-w-0 flex-col justify-center leading-tight">
      <span className="flex min-w-0 items-center gap-1.5">
        <MethodGlyph kind={m.kind} />
        <span className="truncate text-gray-800">{m.label}</span>
      </span>
      {m.tag && <span className="truncate pl-[22px] text-xs text-gray-500">{m.tag === "keypad" ? "Phone keypad" : "Saved on file"}</span>}
    </div>
  );
}

function SecuredCell({ data, node }: CustomCellRendererProps<JobRow, number>) {
  const totals = totalsOf(node, data);
  if (totals) {
    return (
      <div className="flex h-full flex-col items-end justify-center leading-tight">
        <span className="tabular-nums text-gray-900">{dollars(totals.heldCents)}</span>
        <span className="text-xs font-normal text-gray-500">{totals.cards ? `+ ${plural(totals.cards, "card")} on file` : "held now"}</span>
      </div>
    );
  }
  if (!data) return null;
  if (cardOnFile(data)) {
    return (
      <div className="flex h-full items-center justify-end">
        <span className="rounded-md bg-sky-50 px-1.5 py-px text-xs font-medium leading-5 text-sky-700 ring-1 ring-inset ring-sky-200">Card on file</span>
      </div>
    );
  }
  const held = heldCents(data);
  if (held) {
    return (
      <div className="flex h-full flex-col items-end justify-center leading-tight">
        <span className="font-medium tabular-nums text-gray-900">{dollars(held)}</span>
        <span className="text-xs text-indigo-600">held</span>
      </div>
    );
  }
  if (data.status === "awaiting_hold" || data.status === "awaiting_card") return <span className="flex h-full items-center justify-end text-xs text-amber-700">Pending</span>;
  return <Blank right />;
}

function CollectedCell({ value, node }: CustomCellRendererProps<JobRow, number>) {
  if (!value) return node.rowPinned ? <span className="block text-right tabular-nums">{dollars(0)}</span> : <Blank right />;
  return <span className={cx("block text-right tabular-nums text-gray-900", !node.rowPinned && "font-medium")}>{dollars(Math.round(value * 100))}</span>;
}

function RefundedCell({ value, node }: CustomCellRendererProps<JobRow, number>) {
  if (!value) return node.rowPinned ? <span className="block text-right tabular-nums">{dollars(0)}</span> : <Blank right />;
  return <span className="block text-right tabular-nums text-violet-700">−{dollars(Math.round(value * 100))}</span>;
}

function ChannelCell({ value, node }: CustomCellRendererProps<JobRow, string>) {
  if (node.rowPinned || !value) return null;
  const phone = value === "phone";
  return (
    <span className="flex h-full items-center gap-1.5 text-gray-600">
      <Icon name={phone ? "phone" : "globe"} className="h-3.5 w-3.5 text-gray-400" />
      {phone ? "Phone" : "Browser"}
    </span>
  );
}

// ---- Columns -------------------------------------------------------------------------------

const money = (pick: (t: Totals) => number, cents: (j: JobRow) => number) => (p: ValueGetterParams<JobRow>) => {
  const totals = totalsOf(p.node, p.data);
  if (totals) return pick(totals) / 100;
  return p.data ? cents(p.data) / 100 : null;
};

/**
 * In the totals row the Secured cell also shows how many cards are on file. AG Grid redraws a
 * cell when its value changes, so the value there carries both numbers.
 */
function securedValue(p: ValueGetterParams<JobRow>): number | string | null {
  const totals = totalsOf(p.node, p.data);
  if (totals) return `${totals.heldCents}|${totals.cards}`;
  return p.data ? heldCents(p.data) / 100 : null;
}

function customerSearch(job: JobRow | undefined): string {
  if (!job) return "";
  const digits = (job.callback_phone ?? "").replace(/\D/g, "");
  return [job.customer_name, job.service_address, job.zip, job.callback_phone, formatPhone(job.callback_phone), digits.slice(-10)].filter(Boolean).join(" ");
}

const nothing = () => "";

function jobColumns(hidden: ReadonlySet<string>): ColDef<JobRow>[] {
  const col = (def: ColDef<JobRow> & { colId: string }): ColDef<JobRow> => ({ ...def, hide: hidden.has(def.colId) });
  return [
    col({
      colId: "received",
      field: "created_at",
      headerName: "Received",
      initialWidth: 112,
      minWidth: 100,
      initialSort: "desc",
      sortingOrder: ["desc", "asc"],
      valueFormatter: (p) => (p.value && !p.node?.rowPinned ? dayLabel(p.value, Date.now()) : ""),
      cellRenderer: ReceivedCell,
      tooltipValueGetter: (p) => (p.value && !p.node?.rowPinned ? fullTime(p.value) : undefined),
      getQuickFilterText: nothing,
    }),
    col({
      colId: "customer",
      headerName: "Customer",
      // The totals row shows how many jobs are in view here.
      valueGetter: (p) => totalsOf(p.node, p.data)?.count ?? p.data?.customer_name ?? null,
      initialFlex: 1.2,
      minWidth: 150,
      lockVisible: true,
      cellRenderer: CustomerCell,
      getQuickFilterText: (p) => customerSearch(p.data),
      tooltipValueGetter: (p) =>
        p.data && !p.node?.rowPinned ? [p.data.customer_name, p.data.service_address, p.data.callback_phone && formatPhone(p.data.callback_phone)].filter(Boolean).join(" · ") : undefined,
    }),
    col({
      colId: "problem",
      field: "issue",
      headerName: "Problem",
      initialFlex: 1.8,
      minWidth: 180,
      cellRenderer: ProblemCell,
      tooltipValueGetter: (p) => (p.node?.rowPinned ? undefined : (p.data?.issue ?? undefined)),
      getQuickFilterText: (p) => [p.data?.issue, p.data?.urgency].filter(Boolean).join(" "),
    }),
    col({
      colId: "status",
      field: "status",
      headerName: "Status",
      initialWidth: 176,
      minWidth: 160,
      lockVisible: true,
      cellRenderer: StatusCell,
      enableCellChangeFlash: true,
      comparator: (a: string, b: string) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
      getQuickFilterText: (p) => (p.value ? (STATUS_LABEL[p.value] ?? p.value) : ""),
    }),
    col({
      colId: "technician",
      headerName: "Technician",
      initialWidth: 120,
      minWidth: 108,
      valueGetter: (p) => techText(p.data),
      cellRenderer: TechCell,
      enableCellChangeFlash: true,
    }),
    col({
      colId: "method",
      headerName: "Payment method",
      initialWidth: 136,
      minWidth: 124,
      valueGetter: (p) => methodText(p.data?.method),
      cellRenderer: MethodCell,
      enableCellChangeFlash: true,
      tooltipValueGetter: (p) => (p.data?.method?.email ? `PayPal account ${p.data.method.email}` : undefined),
    }),
    col({
      colId: "secured",
      headerName: "Secured",
      headerTooltip: "What covers the visit right now: an open PayPal hold, or a card saved on file ($0 held).",
      type: "rightAligned",
      initialWidth: 100,
      minWidth: 92,
      valueGetter: securedValue,
      comparator: (a: number | null, b: number | null) => (Number(a) || 0) - (Number(b) || 0),
      cellRenderer: SecuredCell,
      enableCellChangeFlash: true,
      getQuickFilterText: nothing,
    }),
    col({
      colId: "collected",
      headerName: "Collected",
      headerTooltip: "Charged through PayPal (the final bill, a trip fee or a balance), after refunds.",
      type: "rightAligned",
      initialWidth: 96,
      minWidth: 88,
      valueGetter: money((t) => t.collectedCents, collectedCents),
      cellRenderer: CollectedCell,
      enableCellChangeFlash: true,
      getQuickFilterText: nothing,
    }),
    col({
      colId: "refunded",
      headerName: "Refunded",
      headerTooltip: "Sent back to the customer through PayPal.",
      type: "rightAligned",
      initialWidth: 96,
      minWidth: 88,
      valueGetter: money((t) => t.refundedCents, (j) => j.refunded_cents ?? 0),
      cellRenderer: RefundedCell,
      enableCellChangeFlash: true,
      getQuickFilterText: nothing,
    }),
    col({
      colId: "channel",
      field: "channel",
      headerName: "Channel",
      initialWidth: 92,
      minWidth: 84,
      cellRenderer: ChannelCell,
      getQuickFilterText: nothing,
    }),
    col({
      colId: "job",
      field: "id",
      headerName: "Job #",
      initialWidth: 72,
      minWidth: 68,
      valueFormatter: (p) => (p.value && !p.node?.rowPinned ? shortId(p.value) : ""),
      cellClass: "font-mono text-xs text-gray-500",
      getQuickFilterText: (p) => (p.value ? shortId(p.value) : ""),
    }),
    // Only in the CSV export.
    { colId: "phone", field: "callback_phone", headerName: "Phone", hide: true, lockVisible: true, getQuickFilterText: nothing },
    { colId: "address", field: "service_address", headerName: "Address", hide: true, lockVisible: true, getQuickFilterText: nothing },
    { colId: "zip", field: "zip", headerName: "ZIP", hide: true, lockVisible: true, getQuickFilterText: nothing },
    { colId: "urgency", field: "urgency", headerName: "Urgency", hide: true, lockVisible: true, getQuickFilterText: nothing },
    {
      colId: "final",
      headerName: "Final bill",
      hide: true,
      lockVisible: true,
      valueGetter: (p) => (p.data?.final_cents != null ? p.data.final_cents / 100 : null),
      getQuickFilterText: nothing,
    },
    { colId: "sample", field: "sample", headerName: "Sample", hide: true, lockVisible: true, getQuickFilterText: nothing },
    { colId: "jobId", field: "id", headerName: "Job ID", hide: true, lockVisible: true, getQuickFilterText: nothing },
  ];
}

const DEFAULT_COL: ColDef<JobRow> = { sortable: true, resizable: true, suppressHeaderMenuButton: true };

const ROW_SELECTION: RowSelectionOptions<JobRow> = {
  mode: "singleRow",
  checkboxes: false,
  enableClickSelection: "enableSelection",
  isRowSelectable: (node) => !node.rowPinned && Boolean(node.data),
};

const LOADING_ROWS = { rowCount: 6 };

const rowId = (p: GetRowIdParams<JobRow>) => p.data.id;

/** Tab moves focus out of the grid; arrow keys move inside it (the WAI-ARIA grid pattern). */
const leaveGrid = () => false as const;

function exportCell(p: ProcessCellForExportParams): string {
  const job = p.node?.data as JobRow | undefined;
  const v = p.value;
  switch (p.column.getColId()) {
    case "received":
      return isoMinute(v);
    case "job":
      return v ? shortId(v) : "";
    case "status":
      return v ? (STATUS_LABEL[v] ?? v) : "";
    case "urgency":
      return v ? (URGENCY[v]?.label ?? v) : "";
    case "phone":
      return v ? formatPhone(v) : "";
    case "secured":
      return job && cardOnFile(job) ? "Card on file" : v ? csvDollars(v) : "";
    case "collected":
    case "refunded":
    case "final":
      return csvDollars(v);
    case "channel":
      return v === "phone" ? "Phone" : v === "web" ? "Browser" : "";
    case "sample":
      return v ? "Sample" : "";
    default:
      return v == null ? "" : String(v);
  }
}

type SavedColumn = Pick<ColumnState, "colId" | "width" | "flex" | "sort" | "sortIndex">;

/** Column order, widths and sort from this browser's last visit. */
function restoreLayout(api: GridApi<JobRow>) {
  const saved = readStored<SavedColumn[]>(LAYOUT_KEY);
  if (!Array.isArray(saved) || !saved.length) return;
  api.applyColumnState({ state: saved.filter((c) => typeof c?.colId === "string"), applyOrder: true });
}

function syncSelection(api: GridApi<JobRow>, id: string | null) {
  if (!id) {
    if (api.getSelectedNodes().length) api.deselectAll("all", "api");
    return;
  }
  const node = api.getRowNode(id);
  if (node && !node.isSelected()) {
    node.setSelected(true, true, "api");
    api.ensureNodeVisible(node, null);
  }
}

/** Whether the last thing the owner did was press a key (focus goes back to the grid only then). */
let usingKeyboard = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", () => (usingKeyboard = true), true);
  window.addEventListener("pointerdown", () => (usingKeyboard = false), true);
}

const ZERO: Totals = { count: 0, heldCents: 0, cards: 0, collectedCents: 0, refundedCents: 0 };
const sameTotals = (a: Totals, b: Totals) =>
  a.count === b.count && a.heldCents === b.heldCents && a.cards === b.cards && a.collectedCents === b.collectedCents && a.refundedCents === b.refundedCents;

const parsePicked = (v: unknown): Record<string, boolean> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, b]) => typeof b === "boolean")) : null;

export function JobsGrid({
  rows,
  loaded,
  online,
  selectedId,
  onSelect,
  onReload,
}: {
  rows: JobRow[];
  loaded: boolean;
  online: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const apiRef = useRef<GridApi<JobRow> | null>(null);
  const counts = useMemo(() => tabCounts(rows), [rows]);

  // The tab: picked this visit, else remembered by this browser, else Needs action when something does.
  const [savedTab, saveTab] = usePreference<TabId | null>(TAB_KEY, (v) => (isTabId(v) ? v : null), null);
  const [visitTab, setVisitTab] = useState<TabId | null>(null);
  const [firstTab, setFirstTab] = useState<TabId | null>(null);
  if (firstTab === null && loaded) setFirstTab(counts.needs > 0 ? "needs" : "all");
  const tab: TabId = visitTab ?? savedTab ?? firstTab ?? "needs";
  const pickTab = useCallback(
    (t: TabId) => {
      setVisitTab(t);
      saveTab(t);
    },
    [saveTab],
  );
  const onTabKey = useTabKeys(TAB_IDS, tab, pickTab);

  // A job opened from a link (/dashboard?job=…) brings up a tab that shows it.
  const [revealed, setRevealed] = useState<string | null>(null);
  if (selectedId && selectedId !== revealed && loaded) {
    const job = rows.find((r) => r.id === selectedId);
    if (job) {
      setRevealed(selectedId);
      if (!inTab(job, tab)) setVisitTab(homeTab(job));
    }
  }

  const [search, setSearch] = useState("");

  // Columns: low-priority ones step aside on narrow grids unless the owner picked them.
  const [picked, setPicked] = usePreference<Record<string, boolean>>(COLUMNS_KEY, parsePicked, {});
  const [measure, width] = useMeasuredWidth(() => contentWidth(window.innerWidth) - (selectedId && window.innerWidth >= 1280 ? 404 : 0));
  const reducedMotion = useReducedMotion();
  const hiddenKey = hiddenColumns(COLUMN_SPECS, width, picked).join(",");
  const columnDefs = useMemo(() => jobColumns(new Set(hiddenKey.split(","))), [hiddenKey]);
  const menuColumns = useMemo(() => {
    const hidden = new Set(hiddenKey.split(","));
    return COLUMN_SPECS.filter((s) => !s.locked).map((s) => ({ id: s.id, label: s.label, visible: !hidden.has(s.id) }));
  }, [hiddenKey]);

  // Totals for the rows in view, pinned under the grid.
  const [totals, setTotals] = useState<Totals | null>(null);
  const pinned = useMemo<TotalsRow[]>(() => (totals && totals.count > 0 ? [{ id: "__totals", totals }] : []), [totals]);

  const overlay = useMemo(() => {
    const t = JOB_TABS.find((x) => x.id === tab) ?? JOB_TABS[0];
    const q = search.trim();
    const text = q
      ? { title: `No jobs match “${q}”.`, body: tab === "all" ? "Try a name, street, phone number or problem." : `That's searching ${t.label}. The All tab searches every job.` }
      : { title: t.emptyTitle, body: t.emptyBody };
    return { messages: { noRows: text, noMatchingRows: text } };
  }, [tab, search]);

  // AG Grid reads callbacks once, and rebuilds itself from its first props when Next shows this
  // page again after it was hidden. Everything it calls reads from here, so it's never stale.
  const latest = useRef({ created: 0, tab, selectedId, rows, columnDefs, loading: !loaded, search, pinned, overlay, onSelect });
  useLayoutEffect(() => {
    Object.assign(latest.current, { tab, selectedId, rows, columnDefs, loading: !loaded, search, pinned, overlay, onSelect });
  });

  useLayoutEffect(() => {
    apiRef.current?.onFilterChanged();
  }, [tab]);

  useEffect(() => {
    const api = apiRef.current;
    if (api) syncSelection(api, selectedId);
  }, [selectedId, rows]);

  // Closing the job panel from the keyboard puts focus back on that job's row.
  const lastSelected = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastSelected.current;
    lastSelected.current = selectedId;
    const api = apiRef.current;
    if (!api || selectedId || !previous || !usingKeyboard) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const node = api.getRowNode(previous);
    if (node?.rowIndex != null) api.setFocusedCell(node.rowIndex, "customer");
  }, [selectedId]);

  const isExternalFilterPresent = useCallback(() => latest.current.tab !== "all", []);
  const doesExternalFilterPass = useCallback((node: IRowNode<JobRow>) => Boolean(node.data && inTab(node.data, latest.current.tab)), []);

  const onGridReady = useCallback((e: GridReadyEvent<JobRow>) => {
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
    restoreLayout(e.api);
    e.api.onFilterChanged();
    syncSelection(e.api, l.selectedId);
  }, []);

  const onGridPreDestroyed = useCallback(() => {
    apiRef.current = null;
  }, []);

  const onModelUpdated = useCallback((e: ModelUpdatedEvent<JobRow>) => {
    const t: Totals = { ...ZERO };
    e.api.forEachNodeAfterFilter((n) => {
      const d = n.data;
      if (!d) return;
      t.count += 1;
      t.heldCents += heldCents(d);
      if (cardOnFile(d)) t.cards += 1;
      t.collectedCents += collectedCents(d);
      t.refundedCents += d.refunded_cents ?? 0;
    });
    setTotals((prev) => (prev && sameTotals(prev, t) ? prev : t));
  }, []);

  // A new call fades in (AG Grid row animation), then glows once so the owner sees it arrive.
  const known = useRef<Set<string> | null>(null);
  const onRowDataUpdated = useCallback((e: RowDataUpdatedEvent<JobRow>) => {
    const before = known.current;
    const ids = new Set<string>();
    const arrived: IRowNode<JobRow>[] = [];
    e.api.forEachNode((n) => {
      if (!n.data) return;
      ids.add(n.data.id);
      if (before && before.size > 0 && !before.has(n.data.id)) arrived.push(n);
    });
    known.current = ids;
    if (!arrived.length) return;
    // Wait for the grid to draw the new rows; only drawn cells can flash.
    window.setTimeout(() => {
      if (!e.api.isDestroyed()) e.api.flashCells({ rowNodes: arrived, flashDuration: 1600, fadeDuration: 1600 });
    }, 250);
  }, []);

  const onSelectionChanged = useCallback((e: SelectionChangedEvent<JobRow>) => {
    if (e.source !== "rowClicked" && e.source !== "spaceKey") return;
    const row = e.api.getSelectedRows()[0];
    latest.current.onSelect(row ? row.id : null);
  }, []);

  const onCellKeyDown = useCallback((e: CellKeyDownEvent<JobRow> | FullWidthCellKeyDownEvent<JobRow>) => {
    const key = (e.event as KeyboardEvent | null | undefined)?.key;
    if (key === "Enter" && e.data && !e.node.rowPinned) {
      e.node.setSelected(true, true, "api");
      latest.current.onSelect(e.data.id);
    } else if (key === "Escape" && latest.current.selectedId) {
      latest.current.onSelect(null);
    }
  }, []);

  const saveTimer = useRef<number | null>(null);
  const onStateUpdated = useCallback((e: StateUpdatedEvent<JobRow>) => {
    if (!e.sources.some((s) => s === "columnOrder" || s === "columnSizing" || s === "sort")) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (e.api.isDestroyed()) return;
      const layout: SavedColumn[] = e.api
        .getColumnState()
        .map(({ colId, width, flex, sort, sortIndex }) => (flex ? { colId, flex, sort, sortIndex } : { colId, width, sort, sortIndex }));
      writeStored(LAYOUT_KEY, layout);
    }, 400);
  }, []);

  const resetLayout = useCallback(() => {
    writeStored(LAYOUT_KEY, null);
    setPicked({});
    apiRef.current?.resetColumnState();
  }, [setPicked]);

  const exportCsv = useCallback(() => {
    const slug = JOB_TABS.find((t) => t.id === tab)?.slug ?? "all";
    apiRef.current?.exportDataAsCsv({
      fileName: `call-captain-jobs-${slug}-${isoDay(new Date())}.csv`,
      columnKeys: EXPORT_COLUMNS,
      skipPinnedBottom: true,
      processCellCallback: exportCell,
    });
  }, [tab]);

  const hasSamples = rows.some((r) => r.sample);
  const empty = loaded && rows.length === 0;
  const inView = totals?.count ?? counts[tab];
  const height = gridHeight(loaded ? inView : LOADING_ROWS.rowCount, JOB_ROW_HEIGHT, loaded && inView > 0, 236, 640);

  return (
    <Card className="@container min-w-0">
      <div className="flex flex-col gap-3 px-4 pt-4 @lg:px-5 @4xl:flex-row @4xl:items-center @4xl:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-gray-900">Calls and jobs</h2>
          <LiveBadge online={online} />
        </div>
        {!empty && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox className="w-full @lg:w-72" value={search} onChange={setSearch} label="Search jobs" placeholder="Search name, address, problem, phone" />
            <ColumnsMenu columns={menuColumns} onToggle={(id, visible) => setPicked({ ...picked, [id]: visible })} onReset={resetLayout} />
            <ExportButton onClick={exportCsv} disabled={!loaded || inView === 0}>
              Export CSV
            </ExportButton>
          </div>
        )}
      </div>

      {empty ? (
        <EmptyState
          icon="phone"
          title="No calls yet"
          actions={
            <>
              <TestCallLink />
              <SampleNightButton loaded={false} onChange={onReload} />
            </>
          }
        >
          Make a test call and watch your agent take an emergency and secure the visit with PayPal. Or load a sample night: seven calls from last night, run through real
          PayPal sandbox payments.
        </EmptyState>
      ) : (
        <>
          <div role="tablist" aria-label="Jobs by stage" className="mt-3 flex overflow-x-auto border-b border-gray-200 px-2 sm:px-3">
            {JOB_TABS.map((t) => {
              const active = t.id === tab;
              const n = counts[t.id];
              return (
                <button
                  key={t.id}
                  id={`jobs-tab-${t.id}`}
                  data-tab={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-controls="jobs-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => pickTab(t.id)}
                  onKeyDown={onTabKey}
                  className={cx(
                    "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors focus-visible:-outline-offset-2",
                    active ? "text-gray-900" : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  {t.id === "live" && n > 0 && (
                    <span className="relative flex h-2 w-2" aria-hidden>
                      <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-70 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
                    </span>
                  )}
                  {t.label}
                  <span
                    className={cx(
                      "min-w-5 rounded-full px-1.5 py-px text-center text-xs tabular-nums",
                      active ? "bg-ink-900 text-white" : t.id === "needs" && n > 0 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600",
                    )}
                  >
                    {loaded ? n : "·"}
                  </span>
                  {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
                </button>
              );
            })}
          </div>

          <div id="jobs-panel" role="tabpanel" aria-labelledby={`jobs-tab-${tab}`} ref={measure} style={{ height }} className={cx("overflow-hidden", !hasSamples && "rounded-b-xl")}>
            <AgGridReact<JobRow>
              theme={gridTheme}
              rowData={rows}
              columnDefs={columnDefs}
              defaultColDef={DEFAULT_COL}
              getRowId={rowId}
              loading={!loaded}
              loadingRows={LOADING_ROWS}
              rowSelection={ROW_SELECTION}
              quickFilterText={search}
              cacheQuickFilter
              includeHiddenColumnsInQuickFilter
              isExternalFilterPresent={isExternalFilterPresent}
              doesExternalFilterPass={doesExternalFilterPass}
              pinnedBottomRowData={pinned}
              animateRows={!reducedMotion}
              cellFlashDuration={900}
              cellFadeDuration={1400}
              maintainColumnOrder
              tooltipShowDelay={400}
              overlayComponent={GridOverlay}
              overlayComponentParams={overlay}
              tabToNextCell={leaveGrid}
              tabToNextHeader={leaveGrid}
              onGridReady={onGridReady}
              onGridPreDestroyed={onGridPreDestroyed}
              onModelUpdated={onModelUpdated}
              onRowDataUpdated={onRowDataUpdated}
              onSelectionChanged={onSelectionChanged}
              onCellKeyDown={onCellKeyDown}
              onStateUpdated={onStateUpdated}
            />
          </div>

          {hasSamples && (
            <div className="flex flex-col gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 px-4 py-3 @lg:px-5 @2xl:flex-row @2xl:items-center @2xl:justify-between">
              <p className="flex items-start gap-2 text-sm text-gray-600">
                <SampleBadge className="mt-0.5" />
                <span>The sample night is loaded: fictional callers, real PayPal sandbox payments.</span>
              </p>
              <SampleNightButton loaded onChange={onReload} className="shrink-0" />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
