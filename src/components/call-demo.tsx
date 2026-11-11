"use client";

import { useCallback, useEffect, useState } from "react";
import type { Job } from "@/lib/db";
import { STATUS_LABEL, STATUS_TONE, dollars } from "@/lib/format";
import { Keypad } from "./keypad";
import { PayPalPay } from "./paypal-hold";
import { useCall } from "./use-call";

const STEPS = [
  { key: "call", label: "Answered" },
  { key: "details", label: "Triage" },
  { key: "hold", label: "PayPal hold" },
  { key: "dispatch", label: "Dispatched" },
] as const;

function stepIndex(job: Job | null): number {
  if (!job) return -1;
  if (["dispatched", "completed", "balance_due", "paid", "cancelled_fee"].includes(job.status)) return 3;
  if (job.status === "hold_placed") return 2.5;
  if (job.status === "awaiting_hold") return 2;
  if (job.customer_name || job.issue) return 1;
  return 0;
}

export function CallDemo({ paypalClientId, liveCalls }: { paypalClientId: string; liveCalls: boolean }) {
  const { phase, error, jobId, liveAt, start, hangUp, sendDigit, audioRef } = useCall();
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    if (res.ok) setJob(((await res.json()) as { job: Job }).job);
  }, [jobId]);

  // Follow the job live while the call is up, then a little longer for the post-call ticket.
  useEffect(() => {
    if (!jobId) return;
    const first = setTimeout(refresh, 0);
    const fast = phase === "live" || phase === "connecting";
    const t = setInterval(refresh, fast ? 1200 : 4000);
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
  const seconds = liveAt && now ? Math.max(0, Math.floor((now - liveAt) / 1000)) : 0;

  const active = phase === "connecting" || phase === "live";
  const current = stepIndex(job);
  const transcript = (job?.events ?? []).filter((e) => e.kind === "caller" || e.kind === "agent_said").slice(-8);
  const money = (job?.events ?? []).filter((e) => !["caller", "agent_said"].includes(e.kind)).slice(-6).reverse();
  const showPayPal = job?.status === "awaiting_hold" && job.hold_method === "paypal" && job.order_id;
  const showKeypad = job?.status === "awaiting_hold" && job.hold_method === "keypad" && phase === "live";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* The phone */}
      <div className="flex flex-col rounded-3xl bg-slate-950 p-6 text-white shadow-xl ring-1 ring-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Harbor Plumbing &amp; Heating</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5">After-hours line</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10">
          <div className="relative">
            {phase === "live" && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />}
            <button
              type="button"
              disabled={!liveCalls}
              onClick={() => void (active ? hangUp() : start())}
              className={`relative flex h-28 w-28 items-center justify-center rounded-full text-sm font-semibold shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                active ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-500 hover:bg-emerald-400"
              }`}
              aria-label={active ? "Hang up" : "Call the after-hours line"}
            >
              <svg viewBox="0 0 24 24" className={`h-10 w-10 ${active ? "rotate-[135deg]" : ""} transition`} fill="currentColor" aria-hidden>
                <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
              </svg>
            </button>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">
              {phase === "idle" && "Tap to call"}
              {phase === "connecting" && "Connecting…"}
              {phase === "live" && `Live with Ava · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
              {phase === "ended" && "Call ended"}
              {phase === "error" && "Couldn't connect"}
            </p>
            <p className="mt-1 max-w-xs text-sm text-slate-400">
              {!liveCalls
                ? "Live calls aren't configured on this deployment."
                : phase === "error"
                  ? error
                  : phase === "live"
                    ? "Talk normally. Ava can hear you."
                    : "Uses your microphone. Pretend it's 2 AM and a pipe just burst."}
            </p>
          </div>
          {showKeypad && (
            <div className="w-full rounded-2xl bg-white p-4 text-slate-900">
              <p className="mb-3 text-center text-sm font-medium">Secure keypad · type the test card below</p>
              <Keypad onDigit={(d) => void sendDigit(d)} />
            </div>
          )}
        </div>
        <ol className="space-y-1.5 border-t border-slate-800 pt-4 text-xs text-slate-400">
          <li>1. Say what happened, like &ldquo;my water heater burst.&rdquo;</li>
          <li>2. Agree to the hold. The PayPal button appears on the right.</li>
          <li>
            3. Pay with the sandbox buyer, or <span className="text-slate-200">Debit or Credit Card</span> with <span className="font-mono text-slate-200">4111 1111 1111 1111</span>, any future date, CVV 123.
          </li>
          <li>4. Or ask to use your keypad and type that same card, then 1229, 123, 95131.</li>
        </ol>
        <audio ref={audioRef} autoPlay className="hidden" />
      </div>

      {/* The live job */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Live job</p>
            <h2 className="text-xl font-semibold text-slate-900">{job?.customer_name ? `${job.customer_name}, ${job.urgency ?? "new"} call` : "Waiting for a call"}</h2>
          </div>
          {job && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[job.status]}`}>{STATUS_LABEL[job.status]}</span>}
        </div>

        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const done = current > i || (i === 2 && current >= 2.5);
            const now = !done && Math.ceil(current) === i;
            return (
              <li key={s.key} className="flex flex-col gap-1.5">
                <span className={`h-1.5 rounded-full ${done ? "bg-emerald-500" : now ? "animate-pulse bg-amber-400" : "bg-slate-200"}`} />
                <span className={`text-xs ${done || now ? "font-medium text-slate-800" : "text-slate-400"}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
          <dt className="text-slate-500">Address</dt>
          <dd className="text-slate-900">{job?.service_address ?? "Not yet"}</dd>
          <dt className="text-slate-500">Problem</dt>
          <dd className="text-slate-900">{job?.issue ?? "Not yet"}</dd>
          <dt className="text-slate-500">Service call</dt>
          <dd className="text-slate-900">{job ? `${dollars(job.fee_cents)} hold, charged after the job` : "Not yet"}</dd>
          <dt className="text-slate-500">Technician</dt>
          <dd className="text-slate-900">{job?.tech_name ? `${job.tech_name}, ${job.eta}` : job?.status === "scheduled" ? job.eta : "Not yet"}</dd>
        </dl>

        {showPayPal && job?.order_id && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-slate-900">Approve the {dollars(job.fee_cents)} hold</p>
            <p className="mb-3 text-sm text-slate-600">Nothing is charged now. Harbor charges only after the work is done, and releases the hold if you cancel before the tech heads out.</p>
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

        {(job?.status === "hold_placed" || job?.status === "dispatched") && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <p className="font-semibold">{dollars(job.fee_cents)} held{job.card_last4 ? ` on card •••• ${job.card_last4}` : " with PayPal"}. $0 charged.</p>
            <p>The owner captures the final amount after the job from the dashboard.</p>
          </div>
        )}

        <div className="grid flex-1 gap-4 md:grid-cols-2">
          <div className="flex min-h-48 flex-col rounded-2xl border border-slate-200 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Transcript</p>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto text-sm">
              {transcript.length === 0 && <p className="text-slate-400">The conversation shows up here as you talk.</p>}
              {transcript.map((t, i) => (
                <p key={i} className={t.kind === "caller" ? "self-end rounded-2xl rounded-br-sm bg-blue-600 px-3 py-1.5 text-white" : "self-start rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-1.5 text-slate-800"}>
                  {t.text}
                </p>
              ))}
            </div>
          </div>
          <div className="flex min-h-48 flex-col rounded-2xl border border-slate-200 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Money trail</p>
            <ul className="space-y-2 text-sm">
              {money.length === 0 && <li className="text-slate-400">Every PayPal step is logged here.</li>}
              {money.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span className="text-slate-700">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {job && (
          <a href={`/dashboard?job=${job.id}`} className="self-end text-sm font-medium text-blue-700 hover:underline">
            Finish the job as the owner →
          </a>
        )}
      </div>
    </div>
  );
}
