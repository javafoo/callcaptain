"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState, useSyncExternalStore } from "react";
import type { Job } from "@/lib/db";
import { dollars } from "@/lib/format";
import { ApproveHandoff } from "./approve-handoff";
import { Button, Icon, cx, inputClass } from "./ui";

/**
 * Finish the job and get paid, in the owner's panel and on the technician's phone: send the
 * final bill to the customer's screen (QR code, link, or hand over the phone), see the approval
 * land live, charge a bill the hold covers right away, cancel or release, and refund.
 */

/** The visit is secured and the final bill isn't charged yet. */
const OPEN = new Set(["hold_placed", "card_saved", "dispatched", "awaiting_approval"]);

const subscribe = () => () => {};
/** The site's address once in the browser (QR codes and links); "" while rendering on the server. */
export function useOrigin(): string {
  return useSyncExternalStore(subscribe, () => window.location.origin, () => "");
}

const toCents = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const plain = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** What secures the visit, as the owner sees it. */
export function securedLabel(job: Job): string {
  if (job.secure_with === "card" && !job.authorization_id) {
    if (!job.vault_id) return "No card saved";
    return job.vault_type === "card" ? `Card •••• ${job.card_last4 ?? ""}`.trim() : job.vault_type === "venmo" ? "Venmo" : "PayPal";
  }
  if (job.hold_method === "keypad") return `Card •••• ${job.card_last4 ?? ""} (keypad)`;
  return job.card_last4 ? `Card •••• ${job.card_last4}` : job.authorization_id ? "PayPal" : "No hold yet";
}

/** The technician's description of the work, sent with the bill. */
export function sentWork(job: Job): string | null {
  const d = (job.approval_evidence as { description?: unknown } | null)?.description;
  return typeof d === "string" && d.trim() ? d.trim() : null;
}

function Line({ label, sub, value, strong }: { label: string; sub?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className={strong ? "font-medium text-gray-900" : "text-gray-600"}>{label}</p>
        {sub && <p className="truncate text-xs text-gray-500">{sub}</p>}
      </div>
      <p className={cx("shrink-0 tabular-nums", strong ? "font-semibold text-gray-900" : "text-gray-900")}>{value}</p>
    </div>
  );
}

export function JobBilling({ job, onChanged, large = false }: { job: Job; onChanged: () => Promise<void> | void; large?: boolean }) {
  const origin = useOrigin();
  const [amount, setAmount] = useState("");
  const [work, setWork] = useState("");
  const [editing, setEditing] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const card = job.secure_with === "card" && !job.authorization_id;
  const open = OPEN.has(job.status) && !job.approved_at && (card ? Boolean(job.vault_id) : Boolean(job.authorization_id));
  const pending = open && Boolean(job.approval_requested_at && job.approval_cents);
  const kept = job.captured_cents - job.refunded_cents;
  const cents = toCents(amount);
  const refundCents = toCents(refundAmount);
  const link = origin ? `${origin}/pay/${job.id}` : "";
  const first = job.customer_name?.split(" ")[0] ?? "the customer";
  const method = securedLabel(job);
  const described = sentWork(job);
  const evidence = job.approval_evidence as { via?: string } | null;
  const tall = large ? "h-12 text-base" : "";

  const act = async (action: string, body: Record<string, unknown> = {}, after?: () => void) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) after?.();
      else setError(out.error ?? "PayPal didn't accept that.");
    } catch {
      setError("No connection. Try again.");
    }
    setBusy(null);
    await onChanged();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Copying didn't work here. The link is ${link}`);
    }
  };

  const hint = !cents
    ? null
    : card
      ? `${first === "the customer" ? "The customer approves" : `${first} approves`} ${dollars(cents)} on their screen, then PayPal charges ${method}.`
      : cents <= job.fee_cents
        ? `Comes out of the ${dollars(job.fee_cents)} hold${job.fee_cents > cents ? ` and ${dollars(job.fee_cents - cents)} is released` : ""}. They already authorized up to ${dollars(job.fee_cents)}, so you can also charge it right away.`
        : `They approve on their screen: the ${dollars(job.fee_cents)} hold is charged and they pay the ${dollars(cents - job.fee_cents)} balance there with PayPal, Venmo, card or Pay Later.`;

  /** QR code, hand over the phone, copy or text the link. */
  const share = (
    <>
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-black/5">
        <div className={cx("shrink-0", large ? "h-[148px] w-[148px]" : "h-[112px] w-[112px]")}>
          {link ? (
            <QRCodeSVG value={link} size={large ? 148 : 112} title="Customer's bill" />
          ) : (
            <div className="h-full w-full animate-pulse rounded bg-gray-100" />
          )}
        </div>
        <p className="text-sm text-gray-600">The customer scans this with their phone camera to see the bill and approve it.</p>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <Button type="button" className={cx("w-full", tall)} onClick={() => setHandoff(true)}>
          <Icon name="user" className="h-4 w-4" /> Hand your phone to the customer
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className={tall} onClick={() => void copy()} disabled={!link}>
            {copied ? "Link copied" : "Copy link"}
          </Button>
          {large && job.callback_phone ? (
            <a
              href={`sms:${job.callback_phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`Your final bill is ready. Review and approve it here: ${link}`)}`}
              className={cx("inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-sm", tall)}
            >
              Text the link
            </a>
          ) : (
            <a href={link || undefined} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
              Open page <Icon name="external" className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1.5">
        <Line label={card ? "Service call, card on file" : "Service-call hold"} sub={method} value={dollars(job.fee_cents)} />
        {job.final_cents ? <Line label="Final bill" value={dollars(job.final_cents)} /> : null}
        <Line label="Collected" value={dollars(job.captured_cents)} strong />
        {job.refunded_cents > 0 && <Line label="Refunded" value={`−${dollars(job.refunded_cents)}`} />}
      </div>

      {job.approved_at && (
        <p className="flex items-start gap-2 rounded-lg bg-brand-50 p-2.5 text-xs text-brand-700 ring-1 ring-brand-200">
          <Icon name="check" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span suppressHydrationWarning>
            {job.customer_name ?? "The customer"} approved {dollars(job.approval_cents)} at {clock(job.approved_at)}
            {evidence?.via === "handoff" ? " on the technician's phone" : " on their own device"}.
          </span>
        </p>
      )}

      {open && (!pending || editing) && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act("request_approval", { finalDollars: amount, description: work }, () => setEditing(false));
          }}
        >
          <label className="text-sm font-medium text-gray-700" htmlFor={`final-${job.id}`}>
            {pending ? "New final bill" : "Job done? Enter the final bill"}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              id={`final-${job.id}`}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="1,840"
              className={cx(inputClass, "pl-7", tall)}
            />
          </div>
          <input
            aria-label="What was done (optional)"
            value={work}
            maxLength={140}
            onChange={(e) => setWork(e.target.value)}
            placeholder="What was done (optional), e.g. Replaced the water heater"
            className={cx(inputClass, tall)}
          />
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
          <Button className={cx("w-full", tall)} disabled={!cents || busy !== null}>
            {busy === "request_approval" ? "Sending…" : "Get customer approval"}
          </Button>
          {!card && cents > 0 && cents <= job.fee_cents && (
            <Button type="button" variant="secondary" className={cx("w-full", tall)} disabled={busy !== null} onClick={() => void act("charge_hold", { finalDollars: amount }, () => setAmount(""))}>
              {busy === "charge_hold" ? "Charging…" : `Charge ${dollars(cents)} from the hold now`}
            </Button>
          )}
          {pending && (
            <Button type="button" variant="ghost" className="w-full" onClick={() => setEditing(false)}>
              Keep the {dollars(job.approval_cents)} bill
            </Button>
          )}
        </form>
      )}

      {pending && !editing && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            Waiting for {first} to approve
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{dollars(job.approval_cents)}</p>
          {described && <p className="text-sm text-gray-700">{described}</p>}
          <p className="mt-1 text-xs text-gray-500" suppressHydrationWarning>
            Sent at {clock(job.approval_requested_at!)}. This updates the moment they approve.{" "}
            <button
              type="button"
              className="font-semibold text-brand-700 hover:underline"
              onClick={() => {
                setAmount(plain(job.approval_cents ?? 0));
                setWork(described ?? "");
                setEditing(true);
              }}
            >
              Change the amount
            </button>
          </p>
          {share}
        </div>
      )}

      {job.status === "balance_due" && (
        <div className="rounded-xl bg-orange-50 p-4 ring-1 ring-orange-200">
          <p className="text-sm font-semibold text-gray-900">
            {job.customer_name ?? "The customer"} approved {dollars(job.final_cents)}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            The {dollars(job.captured_cents)} hold is charged. Waiting for the {dollars(job.balance_cents)} balance, paid on their screen with PayPal, Venmo, card or Pay Later.
          </p>
          {share}
        </div>
      )}

      {open && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className={tall} onClick={() => void act("cancel")} disabled={busy !== null}>
            {busy === "cancel" ? "Working…" : "Customer cancelled"}
          </Button>
          <Button type="button" variant="secondary" className={tall} onClick={() => void act("release")} disabled={busy !== null}>
            {busy === "release" ? "Working…" : card ? "Remove card" : "Release hold"}
          </Button>
        </div>
      )}

      {kept > 0 &&
        (!refunding ? (
          <Button
            type="button"
            variant="secondary"
            className={cx("w-full", tall)}
            onClick={() => {
              setRefundAmount(plain(kept));
              setReason("");
              setConfirming(false);
              setRefunding(true);
            }}
          >
            <Icon name="dollar" className="h-4 w-4" /> Refund
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Refund {job.customer_name ?? "the customer"}</p>
              <p className="text-xs text-gray-500">Up to {dollars(kept)}. PayPal sends it back the way they paid.</p>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                aria-label="Amount to refund"
                inputMode="decimal"
                autoComplete="off"
                value={refundAmount}
                onChange={(e) => {
                  setRefundAmount(e.target.value.replace(/[^\d.,]/g, ""));
                  setConfirming(false);
                }}
                className={cx(inputClass, "pl-7", tall)}
              />
            </div>
            <input
              aria-label="Reason (optional)"
              value={reason}
              maxLength={120}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional), e.g. Part wasn't needed"
              className={cx(inputClass, tall)}
            />
            {confirming ? (
              <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
                <p className="text-sm text-red-800">
                  Refund {dollars(refundCents)}{refundCents === kept ? ", everything collected" : ""}? A refund can&apos;t be undone.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    className={tall}
                    disabled={busy !== null}
                    onClick={() =>
                      void act("refund", { amountDollars: refundCents === kept ? null : refundAmount, reason }, () => {
                        setRefunding(false);
                        setConfirming(false);
                      })
                    }
                  >
                    {busy === "refund" ? "Refunding…" : "Yes, refund"}
                  </Button>
                  <Button type="button" variant="secondary" className={tall} onClick={() => setConfirming(false)}>
                    Go back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className={tall} disabled={!refundCents || refundCents > kept} onClick={() => setConfirming(true)}>
                  Refund {refundCents ? dollars(refundCents) : ""}
                </Button>
                <Button type="button" variant="secondary" className={tall} onClick={() => setRefunding(false)}>
                  Cancel
                </Button>
              </div>
            )}
            {refundCents > kept && <p className="text-xs text-red-700">That&apos;s more than the {dollars(kept)} collected.</p>}
          </div>
        ))}

      {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}

      {handoff && (
        <ApproveHandoff
          jobId={job.id}
          onClose={() => {
            setHandoff(false);
            void onChanged();
          }}
        />
      )}
    </div>
  );
}
