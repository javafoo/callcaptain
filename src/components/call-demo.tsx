"use client";

import { useCallback, useEffect, useState } from "react";
import type { Job } from "@/lib/db";
import { dollars, shortId } from "@/lib/format";
import { SaveCardOnFile } from "./card-on-file";
import { KEYPAD_STEPS, SecureKeypad } from "./keypad";
import { PayPalPay } from "./paypal-hold";
import { StatusPill } from "./status-pill";
import { Card, Icon, cx } from "./ui";
import { useCall } from "./use-call";

export type DemoBusiness = { name: string; agentName: string; technician: string; tripFeeCents: number; secureWith: "hold" | "card" };

const steps = (card: boolean) => [
  { label: "Answered", icon: "phone" as const },
  { label: "Triage", icon: "wrench" as const },
  { label: card ? "Card on file" : "PayPal hold", icon: "shield" as const },
  { label: "Dispatched", icon: "truck" as const },
];

function progress(job: Job | null): number {
  if (!job) return -1;
  if (["dispatched", "completed", "balance_due", "paid", "cancelled_fee"].includes(job.status)) return 4;
  if (job.status === "hold_placed" || job.status === "card_saved") return 3;
  if (job.status === "awaiting_hold" || job.status === "awaiting_card") return 2;
  if (job.customer_name || job.issue) return 2;
  return 1;
}

export function CallDemo({ paypalClientId, liveCalls, business }: { paypalClientId: string; liveCalls: boolean; business: DemoBusiness }) {
  const { phase, error, jobId, liveAt, start, hangUp, sendDigit, audioRef } = useCall();
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(0);
  const [tab, setTab] = useState<"conversation" | "activity">("conversation");
  const [keypadFallback, setKeypadFallback] = useState(false);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    if (res.ok) setJob(((await res.json()) as { job: Job }).job);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const first = setTimeout(refresh, 0);
    const fast = phase === "live" || phase === "connecting";
    const t = setInterval(refresh, fast ? 1000 : 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [jobId, phase, refresh]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // If SignalWire's keypad status never arrives, unlock after a few seconds rather than strand the caller.
  const keypadRequested = job?.status === "awaiting_hold" && job.hold_method === "keypad";
  useEffect(() => {
    if (!keypadRequested) return;
    const t = setTimeout(() => setKeypadFallback(true), 7000);
    return () => {
      clearTimeout(t);
      setKeypadFallback(false);
    };
  }, [keypadRequested]);

  const seconds = liveAt && now ? Math.max(0, Math.floor((now - liveAt) / 1000)) : 0;
  const active = phase === "connecting" || phase === "live";
  const step = progress(job);
  const transcript = (job?.events ?? []).filter((e) => e.kind === "caller" || e.kind === "agent_said");
  const activity = (job?.events ?? []).filter((e) => !["caller", "agent_said"].includes(e.kind)).slice().reverse();
  const showPayPal = job?.status === "awaiting_hold" && job.hold_method === "paypal" && job.order_id;
  const keypadUnlocked = KEYPAD_STEPS.some((s) => s.key === job?.pay_step) || job?.pay_step === "payment-processing" || keypadFallback;
  const card = job ? job.secure_with === "card" && job.channel === "web" : business.secureWith === "card";
  const showSaveCard = job?.status === "awaiting_card";
  const held = job?.status === "hold_placed" || job?.status === "card_saved" || job?.status === "dispatched";
  // Keypad open: shrink the phone's header so the whole keypad fits on screen.
  const compact = Boolean(keypadRequested && phase === "live");

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* The homeowner's phone */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-[680px] w-full max-w-[360px] flex-col overflow-hidden rounded-[2.75rem] border-[10px] border-gray-900 bg-gradient-to-b from-ink-800 via-ink-900 to-ink-950 shadow-2xl">
          <div className="absolute left-1/2 top-2 h-6 w-28 -translate-x-1/2 rounded-full bg-gray-900" />
          <div className="flex items-center justify-between px-7 pt-3 text-[11px] font-semibold text-white/80">
            <span>2:07 AM</span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm bg-white/70" /> 5G
            </span>
          </div>

          <div className={cx("flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 pb-4 text-center text-white", compact ? "pt-5" : "pt-10")}>
            {compact ? (
              <p className="text-sm font-semibold text-white/90">{business.name}</p>
            ) : (
              <>
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                  <Icon name="wrench" className="h-9 w-9 text-white/90" />
                </span>
                <p className="mt-4 text-xl font-semibold">{business.name}</p>
                <p className="text-sm text-white/60">After-hours line</p>
              </>
            )}
            <p className={cx("mt-3 text-sm", phase === "error" ? "text-red-300" : "text-white/80")}>
              {phase === "idle" && (liveCalls ? "Tap the green button to call" : "Live calls aren't configured here")}
              {phase === "connecting" && "Calling…"}
              {phase === "live" && `${business.agentName} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
              {phase === "ended" && "Call ended"}
              {phase === "error" && error}
            </p>
            {phase === "live" && !compact && (
              <div className="mt-4 flex h-8 items-end gap-1" aria-hidden>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span key={i} className="w-1.5 animate-pulse rounded-full bg-brand-500" style={{ height: `${10 + ((i * 7) % 22)}px`, animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}

            <div className={cx("w-full", compact ? "mt-3" : "mt-6")}>
              {keypadRequested && phase === "live" && <SecureKeypad serverStep={job?.pay_step ?? null} unlocked={keypadUnlocked} onSend={(d) => void sendDigit(d)} />}
              {held && phase === "live" && (
                <div className="flex items-center gap-2 rounded-2xl bg-brand-500/15 p-3 text-left text-sm text-brand-100 ring-1 ring-brand-500/30">
                  <Icon name="shield" className="h-5 w-5 shrink-0 text-brand-500" />
                  {card ? "Card saved with PayPal. Nothing charged." : `${dollars(job?.fee_cents)} hold approved. Nothing charged.`}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 justify-center pb-8 pt-2">
            <button
              type="button"
              disabled={!liveCalls}
              onClick={() => void (active ? hangUp() : start())}
              className={cx(
                "flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                active ? "bg-red-500 hover:bg-red-600" : "bg-brand-500 hover:bg-brand-600",
              )}
              aria-label={active ? "Hang up" : "Call the after-hours line"}
            >
              <Icon name="phone" className={cx("h-7 w-7 transition", active && "rotate-[135deg]")} />
            </button>
          </div>
          <audio ref={audioRef} autoPlay className="hidden" />
        </div>
        <p className="max-w-[360px] text-center text-xs text-gray-500">You&apos;re the homeowner. Uses your microphone; works best in Chrome on a laptop.</p>
      </div>

      {/* The job, building itself */}
      <Card className="flex min-h-[680px] flex-col">
        {!job ? (
          <div className="flex flex-1 flex-col justify-center gap-8 p-8 sm:p-12">
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name="jobs" className="h-6 w-6" />
              </span>
              <p className="mt-4 text-xl font-semibold text-gray-900">The job builds itself while you talk</p>
              <p className="mt-1 max-w-lg text-sm text-gray-500">You play the homeowner. {business.agentName} handles the call; this card fills in live, and the PayPal {card ? "form appears here when it's time to save a card on file" : "button appears here when it's time to hold the service call"}.</p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ["Call and explain", `Tap the green button and say something like "my water heater burst." Give a name and a San Jose address, ZIP 95112.`],
                card
                  ? ["Save a card", "Say yes when she explains the card on file. Save PayPal with the sandbox buyer from the README, or type the test card below."]
                  : ["Approve the hold", "Say yes to the hold. Pay with the PayPal sandbox buyer from the README, or Debit or Credit Card with the test card below."],
                card
                  ? ["Finish as the owner", "Open the job in Jobs, enter the final bill the customer agreed to, and charge the card. Or try Customer cancelled."]
                  : ["Finish as the owner", "Open the job in Jobs and charge the final bill. Try $120, $1,840 or Customer cancelled."],
              ].map(([title, body], i) => (
                <li key={title} className="rounded-xl border border-gray-200 p-4">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">{i + 1}</span>
                  <p className="mt-3 text-sm font-semibold text-gray-900">{title}</p>
                  <p className="mt-1 text-sm text-gray-500">{body}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-sm ring-1 ring-gray-200">
              <span className="font-medium text-gray-700">Sandbox test card</span>
              <span className="font-mono text-gray-900">4111 1111 1111 1111</span>
              <span className="text-gray-500">Exp <span className="font-mono text-gray-900">12/29</span></span>
              <span className="text-gray-500">CVV <span className="font-mono text-gray-900">123</span></span>
              <span className="text-gray-500">ZIP <span className="font-mono text-gray-900">95131</span></span>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-6 py-5">
              <div>
                <p className="text-xs font-medium text-gray-500">Job {shortId(job.id)} · {job.urgency ?? "new"} · after hours</p>
                <h2 className="mt-1 text-xl font-semibold text-gray-900">{job.customer_name ?? "New caller"}</h2>
              </div>
              <StatusPill status={job.status} />
            </div>

            <ol className="grid grid-cols-4 border-b border-gray-100">
              {steps(card).map((s, i) => {
                const done = step > i;
                const current = step === i;
                return (
                  <li key={s.label} className="flex flex-col items-center gap-1.5 px-2 py-4">
                    <span
                      className={cx(
                        "flex h-9 w-9 items-center justify-center rounded-full",
                        done ? "bg-brand-600 text-white" : current ? "bg-amber-50 text-amber-600 ring-2 ring-amber-300" : "bg-gray-100 text-gray-400",
                      )}
                    >
                      <Icon name={done ? "check" : s.icon} className="h-[18px] w-[18px]" />
                    </span>
                    <span className={cx("text-xs", done || current ? "font-medium text-gray-900" : "text-gray-400")}>{s.label}</span>
                  </li>
                );
              })}
            </ol>

            <div className="grid gap-px bg-gray-100 sm:grid-cols-2">
              {[
                { icon: "pin" as const, label: "Service address", value: job.service_address ? `${job.service_address}${job.zip && !job.service_address.includes(job.zip) ? ` ${job.zip}` : ""}` : null },
                { icon: "wrench" as const, label: "Problem", value: job.issue },
                { icon: "phone" as const, label: "Callback", value: job.callback_phone },
                { icon: "truck" as const, label: "Technician", value: job.tech_name ? `${job.tech_name}, ${job.eta}` : job.status === "scheduled" ? job.eta : null },
              ].map((r) => (
                <div key={r.label} className="flex gap-3 bg-white px-6 py-3.5">
                  <Icon name={r.icon} className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{r.label}</p>
                    <p className={cx("text-sm", r.value ? "text-gray-900" : "text-gray-300")}>{r.value ?? "Waiting…"}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment */}
            <div className="border-y border-gray-100 px-6 py-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">After-hours service call</p>
                <p className="text-sm font-semibold tabular-nums text-gray-900">{dollars(job.fee_cents)}</p>
              </div>
              {job.status === "out_of_area" && <p className="mt-2 text-sm text-gray-500">Outside the service area. No hold, no dispatch.</p>}
              {!held && !["out_of_area", "ended"].includes(job.status) && !showPayPal && !showSaveCard && !keypadRequested && (
                <p className="mt-1 text-sm text-gray-500">
                  {card
                    ? "Card on file, $0 tonight. Charged after the work, once the customer approves the final price."
                    : "Held on the call, charged only after the work. Free to cancel before the tech heads out."}
                </p>
              )}
              {showSaveCard && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-medium text-gray-900">Keep a card on file</p>
                  <p className="mb-3 text-sm text-gray-600">Nothing is charged tonight. You approve the final price with the technician before it&apos;s charged.</p>
                  <SaveCardOnFile clientId={paypalClientId} jobId={job.id} onSaved={setJob} />
                </div>
              )}
              {keypadRequested && <p className="mt-2 text-sm text-gray-600">The caller is typing a card on the secure keypad. PayPal places the hold; {business.agentName} never hears the digits.</p>}
              {showPayPal && job.order_id && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-medium text-gray-900">Approve the {dollars(job.fee_cents)} hold</p>
                  <p className="mb-3 text-sm text-gray-600">Nothing is charged now. You pay after the work is done.</p>
                  <PayPalPay
                    clientId={paypalClientId}
                    orderId={job.order_id}
                    finalize={async (orderId) => {
                      const res = await fetch(`/api/jobs/${job.id}/hold`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ orderId }),
                      });
                      const body = (await res.json()) as { job?: Job; error?: string };
                      if (!res.ok || !body.job) throw new Error(body.error ?? "The hold didn't go through.");
                      setJob(body.job);
                    }}
                  />
                </div>
              )}
              {held && (
                <div className="mt-3 flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
                  <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                  <div className="text-sm">
                    <p className="font-medium text-brand-700">
                      {card
                        ? `${job.vault_type === "card" ? `Card •••• ${job.card_last4}` : job.vault_type === "venmo" ? "Venmo" : "PayPal"} on file. $0 charged.`
                        : `Held with ${job.hold_method === "keypad" ? `card •••• ${job.card_last4}` : "PayPal"}. $0 charged.`}
                    </p>
                    <p className="text-gray-600">
                      {card
                        ? `Charged after the job, once the customer approves the price. Cancel after dispatch and only the ${dollars(business.tripFeeCents)} trip fee is charged.`
                        : `Charged after the job. Cancel after dispatch and only the ${dollars(business.tripFeeCents)} trip fee applies.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Conversation / activity */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex gap-6 border-b border-gray-100 px-6">
                {(["conversation", "activity"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cx("-mb-px border-b-2 py-3 text-sm font-medium capitalize", tab === t ? "border-brand-600 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800")}
                  >
                    {t === "activity" ? "Payment activity" : "Conversation"}
                  </button>
                ))}
              </div>
              <div className="max-h-80 flex-1 overflow-y-auto px-6 py-4">
                {tab === "conversation" ? (
                  <div className="flex flex-col gap-2 text-sm">
                    {transcript.length === 0 && <p className="text-gray-400">The conversation shows up here as you talk.</p>}
                    {transcript.map((t, i) => (
                      <div key={i} className={cx("flex max-w-[85%] flex-col", t.kind === "caller" ? "self-end items-end" : "self-start")}>
                        <span className="mb-0.5 text-[11px] text-gray-400">{t.kind === "caller" ? "Caller" : business.agentName}</span>
                        <p className={cx("rounded-2xl px-3.5 py-2", t.kind === "caller" ? "rounded-br-md bg-ink-800 text-white" : "rounded-bl-md bg-gray-100 text-gray-800")}>{t.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ol className="relative space-y-4 border-l border-gray-200 pl-5">
                    {activity.map((e, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                        <p className="text-sm text-gray-800">{e.text}</p>
                        <p className="text-xs text-gray-400">{new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
              <p className="text-xs text-gray-500">The owner charges the final bill after the job.</p>
              <a href={`/dashboard?job=${job.id}`} className="text-sm font-semibold text-brand-700 hover:text-brand-600">
                Open in Jobs →
              </a>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
