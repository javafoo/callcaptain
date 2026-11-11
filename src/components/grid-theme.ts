import { AllCommunityModule, ModuleRegistry, createPart, themeQuartz } from "ag-grid-community";

/**
 * AG Grid setup shared by the Jobs grid and the PayPal ledger. Community modules only (no
 * Enterprise features, no license watermark), and one theme that matches the app: Inter, ink
 * text, quiet borders, green for selection and for values that just changed.
 */

ModuleRegistry.registerModules([AllCommunityModule]);

export const JOB_ROW_HEIGHT = 56;
export const LEDGER_ROW_HEIGHT = 46;

/**
 * With text selection on, AG Grid wraps each cell's content; let that wrapper fill the row so
 * custom cells can center their content (the theme injects this only for grids using it).
 */
const fullHeightCells = createPart({
  feature: "callCaptainCells",
  css: ".ag-cell-wrapper{height:100%}.ag-cell-wrapper>.ag-cell-value{height:100%;flex:1 1 auto;min-width:0}",
});

export const gridTheme = themeQuartz.withPart(fullHeightCells).withParams({
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
  headerColumnResizeHandleColor: "#d0d5dd",
  rowHoverColor: "#f9fafb",
  selectedRowBackgroundColor: "#ecfdf3",
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  rowHeight: JOB_ROW_HEIGHT,
  headerHeight: 40,
  cellHorizontalPadding: 12,
  // A status or amount that changes during a call glows green for a moment.
  valueChangeValueHighlightBackgroundColor: "rgba(18, 183, 106, 0.2)",
  // The totals row pinned under the jobs and the ledger.
  pinnedRowBackgroundColor: "#f9fafb",
  pinnedRowFontWeight: 600,
  rowLoadingSkeletonEffectColor: "rgba(208, 213, 221, 0.6)",
});

/** The ledger is one line per movement, so its rows are shorter. */
export const ledgerTheme = gridTheme.withParams({ rowHeight: LEDGER_ROW_HEIGHT });
