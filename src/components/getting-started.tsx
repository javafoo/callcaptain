"use client";

import { useEffect, useState } from "react";
import type { Business } from "@/lib/business";
import type { Job } from "@/lib/db";
import { Card, Icon, cx } from "./ui";

/**
 * First-run checklist on the Jobs page: the four steps from sign-up to a live after-hours line.
 * Each step ticks itself off from real data; the card hides once everything is done or the
 * owner dismisses it.
 */

type Settings = { business: Business; saved: boolean };

const DISMISS_KEY = "cc:getting-started-dismissed";

export function GettingStarted({ jobs }: { jobs: Job[] }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        setDismissed(false);
      }
    }, 0);
    void fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Settings | null) => s && setSettings(s))
      .catch(() => {});
    return () => clearTimeout(t);
  }, []);

  const real = jobs.filter((j) => !j.sample);
  const steps = [
    {
      title: "Make the agent yours",
      body: "Paste your website and the AI fills in your services, area and fees.",
      href: "/setup",
      cta: "Agent setup",
      done: Boolean(settings?.saved),
    },
    {
      title: "Call your line",
      body: "Play a homeowner with a burst pipe and approve the PayPal hold.",
      href: "/call",
      cta: "Test call",
      done: real.length > 0,
    },
    {
      title: "Get paid",
      body: "Open a job, enter the final bill, and let the customer approve it.",
      href: real[0] ? `/dashboard?job=${real[0].id}` : "/dashboard",
      cta: "Open a job",
      done: real.some((j) => j.captured_cents > 0),
    },
    {
      title: "Go live",
      body: "Forward your after-hours line and add the call button to your website.",
      href: "/go-live",
      cta: "Go live",
      done: Boolean(settings && (settings.business.testPhones.length > 0 || settings.business.technicianPhone)),
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (dismissed || !settings || left === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Get your after-hours line ready</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {4 - left} of 4 done. About five minutes, and everything runs on PayPal&apos;s test mode.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
          }}
          className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          Hide
        </button>
      </div>
      <ol className="grid gap-px bg-gray-100 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 bg-white p-5">
            <span
              className={cx(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                s.done ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200",
              )}
            >
              {s.done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
            </span>
            <p className={cx("text-sm font-semibold", s.done ? "text-gray-500 line-through decoration-gray-300" : "text-gray-900")}>{s.title}</p>
            <p className="flex-1 text-sm text-gray-500">{s.body}</p>
            {!s.done && (
              <a href={s.href} className="text-sm font-semibold text-brand-700 hover:text-brand-600">
                {s.cta} →
              </a>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
