"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Talk to the dispatcher from the browser (WebRTC through SignalWire, @signalwire/js v4).
 *
 * 1. POST /api/calls/start opens a job and returns a guest token that can dial only our agent.
 * 2. We dial with userVariables { jobId } so the agent works on the same job this page shows.
 * 3. sendDigits() powers the on-screen keypad for the card-by-keypad path.
 */

export type CallPhase = "idle" | "connecting" | "live" | "ended" | "error";

type Subscription = { unsubscribe: () => void };
type SwCall = {
  hangup: () => Promise<void>;
  sendDigits: (digits: string) => Promise<void>;
  remoteStream$: { subscribe: (fn: (stream: MediaStream) => void) => Subscription };
  status$: { subscribe: (fn: (status: string) => void) => Subscription };
};

export function useCall() {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const callRef = useRef<SwCall | null>(null);
  const subsRef = useRef<Subscription[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    for (const sub of subsRef.current) sub.unsubscribe();
    subsRef.current = [];
    callRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  const hangUp = useCallback(async () => {
    const call = callRef.current;
    cleanup();
    setPhase("ended");
    await call?.hangup().catch(() => {});
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setPhase("connecting");
    try {
      // Ask for the mic first so a blocked permission fails fast with a clear message.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());

      const res = await fetch("/api/calls/start", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; token?: string; destination?: string; error?: string };
      if (!res.ok || !body.token || !body.destination || !body.jobId) throw new Error(body.error ?? "The line is busy. Please try again in a minute.");
      setJobId(body.jobId);

      const sdk = await import("@signalwire/js");
      const client = new sdk.SignalWire(new sdk.StaticCredentialProvider({ token: body.token }));
      const call = (await client.dial(body.destination, { audio: true, video: false, userVariables: { jobId: body.jobId } })) as unknown as SwCall;
      callRef.current = call;

      subsRef.current.push(
        call.remoteStream$.subscribe((stream) => {
          if (!audioRef.current) return;
          audioRef.current.srcObject = stream;
          void audioRef.current.play().catch(() => {});
        }),
        call.status$.subscribe((status) => {
          if (status === "connected") {
            setLiveAt(Date.now());
            setPhase("live");
          }
          else if (status === "failed") {
            setError("The call couldn't connect. Please try again.");
            setPhase("error");
            cleanup();
          } else if (status === "disconnected" || status === "destroyed") {
            setPhase((p) => (p === "error" ? p : "ended"));
            cleanup();
          }
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(/NotAllowedError|Permission|denied/i.test(message) ? "Allow microphone access to talk to the dispatcher." : message);
      setPhase("error");
      cleanup();
    }
  }, [cleanup]);

  const sendDigit = useCallback(async (digit: string) => {
    await callRef.current?.sendDigits(digit).catch(() => {});
  }, []);

  useEffect(
    () => () => {
      void callRef.current?.hangup().catch(() => {});
      cleanup();
    },
    [cleanup],
  );

  return { phase, error, jobId, liveAt, start, hangUp, sendDigit, audioRef };
}
