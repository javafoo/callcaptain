"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApproveBill, BalanceStep, type ApproveView } from "./approve-bill";
import { Button, Icon } from "./ui";

/**
 * "Hand your phone to the customer": the customer's approval screen, full screen on the
 * technician's device. The same bill, the same server checks, recorded as approved on the
 * technician's phone.
 */
export function ApproveHandoff({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [view, setView] = useState<ApproveView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/approve`, { cache: "no-store" });
        if (!res.ok) throw new Error("load failed");
        const next = (await res.json()) as ApproveView;
        if (live) setView(next);
      } catch {
        if (live) setProblem("The bill didn't load. Check the connection and try again.");
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [jobId]);

  // The parent re-renders on every live update; keep the latest close handler without re-running effects.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // Full screen: no page scrolling behind it; Escape closes it on a keyboard.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  let content: ReactNode;
  if (problem) content = <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{problem}</p>;
  else if (!view) content = <div className="h-[520px] animate-pulse rounded-2xl bg-gray-200/60" aria-label="Loading the bill" />;
  else if (view.bill) content = <ApproveBill jobId={jobId} bill={view.bill} clientId={view.clientId} via="handoff" onFinished={onClose} />;
  else if (view.balance && !paid) {
    content = (
      <BalanceStep
        business={view.business}
        jobId={jobId}
        clientId={view.clientId}
        orderId={view.balance.orderId}
        balanceCents={view.balance.balanceCents}
        heldCents={view.balance.paidCents}
        onPaid={() => setPaid(true)}
      />
    );
  } else {
    content = (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-gray-200">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon name="check" className="h-5 w-5" />
        </span>
        <p className="mt-3 font-semibold text-gray-900">{paid ? "Paid in full. Thank you!" : "Nothing left to approve"}</p>
        <p className="mt-1 text-sm text-gray-600">{paid ? `Hand the phone back to ${view.tech ?? "your technician"}.` : "This bill was already approved."}</p>
        <Button className="mt-4 h-12 w-full text-base" onClick={onClose}>
          Back to the job
        </Button>
      </div>
    );
  }

  // On <body>, above the app's sidebar and sticky panels whatever the parent's stacking context.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Customer approval" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Icon name="user" className="h-3.5 w-3.5" /> For the customer
          </p>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200/60">
            Close
          </button>
        </div>
        {content}
      </div>
    </div>,
    document.body,
  );
}
