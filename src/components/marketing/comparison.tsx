import { Icon, cx } from "@/components/ui";
import { Glyph } from "./icons";
import { Cite, Container, SectionHeading } from "./primitives";
import type { SourceKey } from "./sources";

type Mark = "yes" | "partial" | "no" | "none";
type Cell = { mark: Mark; text: string; sources?: SourceKey[] };

const COLUMNS = ["Voicemail", "Answering service", "AI receptionist", "Call Captain"] as const;
const OURS = COLUMNS.length - 1;

/** Categories, never brands. Cells say what each kind of service typically does. */
const ROWS: { label: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  {
    label: "Answers 24/7",
    cells: [
      { mark: "partial", text: "Takes a message" },
      { mark: "yes", text: "Yes, a live operator" },
      { mark: "yes", text: "Yes" },
      { mark: "yes", text: "Yes, in 6 languages" },
    ],
  },
  {
    label: "Walks the caller through safety steps",
    cells: [
      { mark: "no", text: "No" },
      { mark: "partial", text: "If it’s in the script" },
      { mark: "partial", text: "If configured" },
      { mark: "yes", text: "Water shutoff first. Gas means 911, no dispatch" },
    ],
  },
  {
    label: "Secures payment before dispatch",
    cells: [
      { mark: "no", text: "No" },
      { mark: "partial", text: "Some take a card by phone" },
      { mark: "no", text: "Books a time slot" },
      { mark: "yes", text: "Card on file or a PayPal hold" },
    ],
  },
  {
    label: "Card never read out loud",
    cells: [
      { mark: "none", text: "No payment taken" },
      { mark: "no", text: "Read to an operator" },
      { mark: "partial", text: "Varies" },
      { mark: "yes", text: "PayPal form or keypad. The AI never hears it" },
    ],
  },
  {
    label: "Charges after the job",
    cells: [
      { mark: "no", text: "You invoice later" },
      { mark: "no", text: "You invoice later" },
      { mark: "no", text: "You invoice later" },
      { mark: "yes", text: "Customer approves, PayPal captures" },
    ],
  },
  {
    label: "Typical cost",
    cells: [
      { mark: "none", text: "Included with your phone plan" },
      { mark: "none", text: "Per minute, about $1.37\u2060–\u2060$5", sources: ["map", "ruby"] },
      { mark: "none", text: "Monthly subscription" },
      { mark: "none", text: "Free during beta, plus standard PayPal fees" },
    ],
  },
];

export function Comparison() {
  return (
    <section aria-labelledby="compare-title" className="bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="compare-title"
          eyebrow="Compare"
          title="What answers your phone at 2 AM?"
          lead="Kinds of service, not brands. Each cell is what that kind of service typically does; individual products vary."
        />

        {/* Tablet and up: a real table. */}
        <div className="mt-14 hidden overflow-hidden rounded-2xl ring-1 ring-gray-200 md:block">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">Voicemail, answering services, AI receptionists and Call Captain compared</caption>
            <colgroup>
              <col className="w-[22%]" />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="bg-gray-50">
                <th scope="col" className="p-4 align-bottom text-xs font-medium text-gray-500">
                  <span className="sr-only">What it does</span>
                </th>
                {COLUMNS.map((c, i) => (
                  <th key={c} scope="col" className={cx("p-4 align-bottom font-semibold", i === OURS ? "bg-ink-900 text-white" : "text-gray-900")}>
                    {i === OURS ? (
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 text-white">
                          <Icon name="shield" className="h-3.5 w-3.5" />
                        </span>
                        {c}
                      </span>
                    ) : (
                      c
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-gray-200">
                  <th scope="row" className="p-4 align-top font-medium text-gray-900">
                    {r.label}
                  </th>
                  {r.cells.map((cell, i) => (
                    <td key={i} className={cx("p-4 align-top", i === OURS ? "bg-brand-50/70 font-medium text-gray-900" : "text-gray-600")}>
                      <CellBody cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: one card per row, the four kinds side by side. */}
        <div className="mt-10 space-y-3 md:hidden">
          {ROWS.map((r) => (
            <div key={r.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900">{r.label}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                {r.cells.map((cell, i) => (
                  <div key={i} className={cx("rounded-lg p-2.5", i === OURS ? "bg-brand-50 ring-1 ring-brand-200" : "bg-gray-50")}>
                    <dt className={cx("text-[11px] font-semibold", i === OURS ? "text-brand-700" : "text-gray-500")}>{COLUMNS[i]}</dt>
                    <dd className={cx("mt-1 text-[13px]", i === OURS ? "font-medium text-gray-900" : "text-gray-700")}>
                      <CellBody cell={cell} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function CellBody({ cell }: { cell: Cell }) {
  return (
    <span className="flex items-start gap-2">
      <MarkIcon mark={cell.mark} />
      <span className="min-w-0">
        {cell.text}
        {cell.sources && <Cite source={cell.sources} />}
      </span>
    </span>
  );
}

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === "none") return null;
  const style = {
    yes: "bg-brand-600 text-white",
    partial: "bg-amber-100 text-amber-700",
    no: "bg-gray-100 text-gray-500",
  }[mark];
  return (
    <span className={cx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", style)} aria-hidden>
      <Glyph name={mark === "yes" ? "check" : mark === "partial" ? "minus" : "cross"} className="h-3 w-3" />
    </span>
  );
}
