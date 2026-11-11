"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dollars } from "@/lib/format";
import type { ApprovalSummary } from "@/lib/money";
import { BalancePay } from "./balance-pay";
import { BillRow, BillSection, BillShell } from "./receipt-shell";
import { Button, Icon } from "./ui";

/**
 * The customer approves the final bill on their own screen (/pay/[id]) or on the technician's
 * phone. It says exactly what happens: charged from the hold with the rest released, the hold
 * applied and the balance paid right here, or the card on file charged. The server checks the
 * amount, saves the approval (time, IP, device) and charges PayPal in the same request.
 */

/** GET /api/jobs/[id]/approve: the bill to approve, or the balance left to pay after approving. */
export type ApproveView = {
  status: string;
  business: string;
  tech: string | null;
  bill: ApprovalSummary | null;
  balance: { orderId: string; balanceCents: number; finalCents: number; paidCents: number } | null;
  clientId: string;
};

type Step = { kind: "review" } | { kind: "balance"; orderId: string; balanceCents: number } | { kind: "done" };

export function ApproveBill({
  jobId,
  bill,
  clientId,
  via,
  onFinished,
}: {
  jobId: string;
  bill: ApprovalSummary;
  clientId: string;
  /** "link": the customer's own device; "handoff": the technician's phone, handed over. */
  via: "link" | "handoff";
  /** Handoff: the technician takes the phone back. */
  onFinished?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "review" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const finished = () => {
    setStep({ kind: "done" });
    if (via === "link") router.refresh(); // the server renders the receipt
  };

  const approve = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: bill.finalCents, via }),
      });
      const out = (await res.json().catch(() => ({}))) as { status?: string; balanceOrderId?: string | null; balanceCents?: number; error?: string };
      if (!res.ok) {
        setProblem(out.error ?? "PayPal didn't take the payment. Try again.");
        if (res.status === 409 && via === "link") router.refresh(); // show the bill as it is now
        return;
      }
      if (out.status === "balance_due" && out.balanceOrderId) setStep({ kind: "balance", orderId: out.balanceOrderId, balanceCents: out.balanceCents ?? bill.balanceCents });
      else finished();
    } catch {
      setProblem("No connection. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === "balance") {
    return (
      <BalanceStep
        business={bill.business}
        jobId={jobId}
        clientId={clientId}
        orderId={step.orderId}
        balanceCents={step.balanceCents}
        heldCents={bill.holdCents}
        onPaid={finished}
      />
    );
  }

  if (step.kind === "done") {
    return (
      <BillShell business={bill.business} meta="Final bill" label={bill.mode === "hold_over" ? "Paid in full" : "Approved and paid"} amount={dollars(bill.finalCents)}>
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-brand-700 ring-1 ring-brand-200">
          <Icon name="check" className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Thank you. You&apos;re all paid.</p>
            <p className="text-sm text-gray-600">
              {via === "handoff" ? `Hand the phone back to ${bill.tech ?? "your technician"}.` : "Your receipt is on its way to this page."}
            </p>
          </div>
        </div>
        {via === "handoff" && onFinished && (
          <Button className="mt-4 h-12 w-full text-base" onClick={onFinished}>
            Back to the job
          </Button>
        )}
      </BillShell>
    );
  }

  const name = bill.customer?.split(" ")[0];
  return (
    <BillShell business={bill.business} meta="Final bill" label="To approve" amount={dollars(bill.finalCents)}>
      <p className="text-sm text-gray-600">
        {name ? `Hi ${name}. ` : ""}
        {bill.tech ?? "Your technician"} finished the work. Check the bill, then approve it here.
      </p>

      {(bill.work || bill.issue) && (
        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">The work</p>
          <p className="mt-1 text-sm text-gray-900">{bill.work ?? bill.issue}</p>
          {bill.work && bill.issue && <p className="mt-1 text-xs text-gray-500">You called about: {bill.issue.replace(/\.$/, "")}</p>}
          {bill.address && <p className="mt-1 text-xs text-gray-500">{bill.address}</p>}
        </div>
      )}

      <BillSection title="How it's paid">
        <BillRow label="Final bill" amount={dollars(bill.finalCents)} />
        {bill.mode === "hold_within" && (
          <>
            <BillRow label={`From your ${dollars(bill.holdCents)} hold`} sub={bill.method} amount={dollars(bill.finalCents)} strong />
            {bill.releasedCents > 0 && <BillRow label="Released back to you, never charged" amount={dollars(bill.releasedCents)} muted />}
          </>
        )}
        {bill.mode === "hold_over" && (
          <>
            <BillRow label={`Your ${dollars(bill.holdCents)} hold, applied`} sub={bill.method} amount={`−${dollars(bill.holdCents)}`} />
            <BillRow label="Balance to pay now" sub="PayPal, Venmo, card or Pay Later" amount={dollars(bill.balanceCents)} strong />
          </>
        )}
        {bill.mode === "card" && <BillRow label={`Charged to ${bill.method}`} sub="Saved with PayPal" amount={dollars(bill.finalCents)} strong />}
      </BillSection>

      <div className="mt-5 rounded-xl border border-gray-200 p-4">
        <p className="font-semibold text-gray-900">{bill.headline}.</p>
        <p className="mt-1 text-sm text-gray-600">{bill.detail}</p>
      </div>

      <button
        type="button"
        onClick={() => void approve()}
        disabled={busy}
        className="mt-4 flex h-13 w-full items-center justify-center rounded-full bg-brand-600 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? "Approving…" : bill.button}
      </button>
      {problem && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{problem}</p>}
      <p className="mt-4 text-center text-xs text-gray-500">
        Questions about the bill? Ask {bill.tech ?? "your technician"} before you approve. Your approval is saved with the time and this device.
      </p>
    </BillShell>
  );
}

/** After approving a bill above the hold: the hold is applied, the balance is paid here. */
export function BalanceStep({
  business,
  jobId,
  clientId,
  orderId,
  balanceCents,
  heldCents,
  onPaid,
}: {
  business: string;
  jobId: string;
  clientId: string;
  orderId: string;
  balanceCents: number;
  heldCents: number;
  onPaid: () => void;
}) {
  return (
    <BillShell business={business} meta="Final bill approved" label="Balance to pay" amount={dollars(balanceCents)}>
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
        <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <div className="text-sm">
          <p className="font-semibold text-brand-700">Approved. Your {dollars(heldCents)} hold was applied.</p>
          <p className="mt-0.5 text-gray-600">Pay the {dollars(balanceCents)} balance to finish.</p>
        </div>
      </div>
      <div className="mt-5">
        <BalancePay jobId={jobId} clientId={clientId} orderId={orderId} paid={false} balance={dollars(balanceCents)} onPaid={onPaid} />
      </div>
    </BillShell>
  );
}
