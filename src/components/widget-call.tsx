"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/db";
import { dollars } from "@/lib/format";
import { isNotice, techLine } from "./call-demo";
import { SaveCardOnFile } from "./card-on-file";
import { KEYPAD_STEPS, SecureKeypad } from "./keypad";
import { PayPalPay } from "./paypal-hold";
import { Icon, cx } from "./ui";
import { useCall } from "./use-call";

/**
 * The call panel a contractor's website opens through /embed.js: talk to the dispatcher,
 * approve the PayPal hold, see confirmation. Built for a 380 x 640 frame.
 */
export function WidgetCall({
  paypalClientId,
  liveCalls,
  businessId,
  businessName,
  agentName,
}: {
  paypalClientId: string;
  liveCalls: boolean;
  businessId: string;
  businessName: string;
  agentName: string;
}) {
  const { phase, error, jobId, liveAt, start, hangUp, sendDigit, audioRef } = useCall(businessId);
  const [job, setJob] = useState<Job | null>(null);
  const [now, setNow] = useState(0);
  const [keypadFallback, setKeypadFallback] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    if (res.ok) setJob(((await res.json()) as { job: Job }).job);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, phase === "live" || phase === "connecting" ? 1000 : 4000);
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

  const keypadRequested = job?.status === "awaiting_hold" && job.hold_method === "keypad";
  useEffect(() => {
    if (!keypadRequested) return;
    const t = setTimeout(() => setKeypadFallback(true), 7000);
    return () => {
      clearTimeout(t);
      setKeypadFallback(false);
    };
  }, [keypadRequested]);

  const transcript = (job?.events ?? []).filter((e) => (e.kind === "caller" && !isNotice(e.text)) || e.kind === "agent_said").slice(-6);
  const tech = techLine(job);
  useEffect(() => {
    // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React would call it as a cleanup.
    bottom.current?.scrollIntoView({ block: "end" });
  }, [transcript.length]);

  const active = phase === "connecting" || phase === "live";
  const seconds = liveAt && now ? Math.max(0, Math.floor((now - liveAt) / 1000)) : 0;
  const showPayPal = job?.status === "awaiting_hold" && job.hold_method === "paypal" && job.order_id;
  const held = job?.status === "hold_placed" || job?.status === "card_saved" || job?.status === "dispatched";
  const card = job?.secure_with === "card";
  const keypadUnlocked = KEYPAD_STEPS.some((s) => s.key === job?.pay_step) || job?.pay_step === "payment-processing" || keypadFallback;

  return (
    <div className="flex h-screen flex-col bg-ink-900 text-white">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Icon name="wrench" className="h-5 w-5" />
        </span>
        <div className="min-w-0 pr-8">
          <p className="truncate font-semibold">{businessName}</p>
          <p className="flex items-center gap-1.5 text-xs text-ink-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> {agentName}, AI dispatcher · available 24/7
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-t-3xl bg-white text-gray-900">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {phase === "idle" || (phase === "ended" && !job) ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-lg font-semibold">Talk to us right now</p>
              <p className="text-sm text-gray-500">
                {agentName} can walk you through stopping a leak, check if we cover your area, and send a technician tonight. Free to call from your browser.
              </p>
            </div>
          ) : (
            <>
              {transcript.map((t, i) => (
                <div key={i} className={cx("flex max-w-[85%] flex-col", t.kind === "caller" ? "ml-auto items-end" : "")}>
                  <p className={cx("rounded-2xl px-3 py-2 text-sm", t.kind === "caller" ? "rounded-br-md bg-ink-800 text-white" : "rounded-bl-md bg-gray-100 text-gray-800")}>{t.text}</p>
                </div>
              ))}
              {phase === "connecting" && <p className="text-center text-sm text-gray-500">Connecting…</p>}
              {showPayPal && job?.order_id && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-semibold">Approve the {dollars(job.fee_cents)} hold</p>
                  <p className="mb-3 text-xs text-gray-600">Nothing is charged now. You pay after the work is done.</p>
                  <PayPalPay
                    clientId={paypalClientId}
                    orderId={job.order_id}
                    finalize={async (orderId) => {
                      const res = await fetch(`/api/jobs/${job.id}/hold`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
                      const body = (await res.json()) as { job?: Job; error?: string };
                      if (!res.ok || !body.job) throw new Error(body.error ?? "The hold didn't go through.");
                      setJob(body.job);
                    }}
                  />
                </div>
              )}
              {job?.status === "awaiting_card" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-semibold">Keep a card on file</p>
                  <p className="mb-3 text-xs text-gray-600">Nothing is charged tonight. You approve the final price with the technician first.</p>
                  <SaveCardOnFile clientId={paypalClientId} jobId={job.id} onSaved={setJob} />
                </div>
              )}
              {keypadRequested && phase === "live" && (
                <div className="rounded-2xl bg-ink-900 p-2">
                  <SecureKeypad serverStep={job?.pay_step ?? null} unlocked={keypadUnlocked} onSend={(d) => void sendDigit(d)} />
                </div>
              )}
              {held && (
                <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
                  <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                  <div className="text-sm">
                    <p className="font-semibold text-brand-700">{card ? "Card saved with PayPal. $0 charged." : `${dollars(job?.fee_cents)} hold placed. $0 charged.`}</p>
                    {!tech && job?.tech_name && <p className="text-gray-600">{job.tech_name} is on the way, arriving in {job.eta}.</p>}
                  </div>
                </div>
              )}
              {tech && (
                <div
                  className={cx(
                    "flex items-center gap-3 rounded-2xl p-4 text-sm font-medium ring-1",
                    tech.tone === "calling" && "bg-amber-50 text-amber-800 ring-amber-200",
                    tech.tone === "accepted" && "bg-brand-50 text-brand-700 ring-brand-200",
                    tech.tone === "unavailable" && "bg-rose-50 text-rose-700 ring-rose-200",
                  )}
                >
                  {tech.tone === "calling" ? (
                    <span className="mx-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
                  ) : (
                    <Icon name={tech.tone === "accepted" ? "truck" : "phone"} className="h-5 w-5 shrink-0" />
                  )}
                  {tech.text}
                </div>
              )}
              <div ref={bottom} />
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            disabled={!liveCalls}
            onClick={() => void (active ? hangUp() : start())}
            className={cx(
              "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-40",
              active ? "bg-red-500 hover:bg-red-600" : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            <Icon name="phone" className={cx("h-4 w-4", active && "rotate-[135deg]")} />
            {phase === "live" ? `Hang up · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : phase === "connecting" ? "Connecting…" : phase === "ended" ? "Call again" : "Call now"}
          </button>
          {phase === "error" && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
          <p className="mt-2 text-center text-[11px] text-gray-400">Uses your microphone · Powered by Call Captain · PayPal test mode</p>
        </div>
      </div>
      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
}
