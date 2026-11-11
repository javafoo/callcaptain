"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef } from "react";
import type { Job } from "@/lib/db";
import { dollars, shortId } from "@/lib/format";
import { StatusPill } from "./status-pill";
import { Card, CardHeader } from "./ui";

/** Every job in the workspace, in AG Grid. Clicking a row opens it in the job panel. */

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

export function JobsGrid({
  jobs,
  loaded,
  selectedId,
  onSelect,
}: {
  jobs: Job[];
  loaded: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const api = useRef<GridApi<Job> | null>(null);

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

  // Keep the grid's highlighted row in step with the job panel (e.g. /dashboard?job=…).
  useEffect(() => {
    if (selectedId) api.current?.getRowNode(selectedId)?.setSelected(true);
  }, [selectedId, jobs]);

  return (
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
          onGridReady={(e) => {
            api.current = e.api;
          }}
          onRowClicked={(e) => e.data && onSelect(e.data.id)}
          onFirstDataRendered={(e) => {
            if (selectedId) e.api.getRowNode(selectedId)?.setSelected(true);
          }}
          overlayNoRowsTemplate="No calls yet. Make one from Test call."
        />
      </div>
    </Card>
  );
}
