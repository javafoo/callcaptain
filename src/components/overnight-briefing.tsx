"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Briefing } from "@/lib/briefing";
import { dollars } from "@/lib/format";
import { Card, Icon } from "./ui";

/**
 * "Overnight": the AI's summary of the night on top of the Jobs page, with the people to call
 * back. Refreshes itself when the night's jobs change (pass a key that changes with them).
 */
export function OvernightBriefing({ changeKey }: { changeKey: string }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  const load = useCallback(async () => {
    const res = await fetch("/api/briefing", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setState((s) => (s === "ready" ? s : "error"));
    const body = (await res.json()) as { briefing: Briefing | null };
    setBriefing(body.briefing);
    setState(body.briefing ? "ready" : "empty");
  }, []);

  // Load once, then refresh only after the night's jobs have been quiet for 30 seconds,
  // so a live call doesn't regenerate the summary on every step.
  const first = useRef(true);
  useEffect(() => {
    const t = setTimeout(load, first.current ? 0 : 30_000);
    first.current = false;
    return () => clearTimeout(t);
  }, [changeKey, load]);

  if (state === "empty" || state === "error") return null;

  if (state === "loading" || !briefing) {
    return (
      <Card className="p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-gray-100" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-100" />
      </Card>
    );
  }

  const f = briefing.facts;
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
            <Icon name="sparkle" className="h-3.5 w-3.5" /> Overnight
          </p>
          <p className="mt-1.5 text-lg font-semibold text-gray-900">{briefing.headline}</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {briefing.points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            {f.calls} {f.calls === 1 ? "call" : "calls"} · {f.secured} secured with PayPal{f.heldNow > 0 ? ` · ${dollars(f.heldNow)} held` : ""} · {dollars(f.collected)} collected
          </p>
        </div>
        {briefing.callbacks.length > 0 && (
          <div className="rounded-xl bg-amber-50/70 p-4 ring-1 ring-inset ring-amber-200">
            <p className="text-sm font-semibold text-gray-900">Call back today</p>
            <ul className="mt-2 space-y-2.5">
              {briefing.callbacks.map((c) => (
                <li key={c.jobId} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <a href={`/dashboard?job=${c.jobId}`} className="font-medium text-gray-900 hover:underline">
                      {c.name}
                    </a>
                    {c.phone && (
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-600">
                        <Icon name="phone" className="h-3.5 w-3.5" /> {c.phone}
                      </a>
                    )}
                  </div>
                  <p className="text-gray-600">{c.why}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
