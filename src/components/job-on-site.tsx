"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Job } from "@/lib/db";
import { shortId } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { JobBilling } from "./job-billing";
import { StatusPill } from "./status-pill";
import { Card, Icon, cx } from "./ui";

/**
 * What the technician opens on site, on a phone: call the customer, get directions, read the
 * AI ticket, then send the final bill and get paid. Follows the job live, so an approval made on
 * the customer's own phone shows up here within seconds.
 */
export function JobOnSite({ initialJob, editable }: { initialJob: Job; editable: boolean }) {
  const [job, setJob] = useState(initialJob);
  const id = initialJob.id;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (res.ok) setJob(((await res.json()) as { job: Job }).job);
    } catch {
      // A dropped signal on site: keep showing the last state and try again on the next tick.
    }
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 3000);
    return () => clearInterval(t);
  }, [load]);

  const summary = job.summary as Record<string, string> | null;
  const address = [job.service_address, job.zip && !job.service_address?.includes(job.zip) ? job.zip : null].filter(Boolean).join(" ");
  const phone = job.callback_phone?.replace(/[^\d+]/g, "") ?? "";
  const urgency = summary?.urgency ?? job.urgency;
  const first = job.customer_name?.split(" ")[0];
  const timeline = job.events.filter((e) => e.kind !== "caller" && e.kind !== "agent_said").slice().reverse();
  const big = "flex h-14 items-center justify-center gap-2 rounded-xl text-base font-semibold shadow-sm transition";

  return (
    <div className="flex flex-col gap-4 pb-8">
      <Link href={`/dashboard?job=${job.id}`} className="inline-flex w-fit items-center gap-1 py-1 text-sm font-medium text-gray-500 hover:text-gray-700">
        <span aria-hidden>←</span> All jobs
      </Link>

      {!editable && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">The public demo line is read-only. Open your own workspace to manage jobs.</p>
      )}

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-gray-500">
            Job {shortId(job.id)}
            {urgency ? ` · ${urgency.charAt(0).toUpperCase()}${urgency.slice(1)}` : ""}
          </p>
          <StatusPill status={job.status} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{job.customer_name ?? "Unknown caller"}</h1>
        <p className="mt-1 text-base text-gray-700">{job.issue ?? "No problem described"}</p>
        <div className="mt-3 space-y-1.5 text-sm text-gray-600">
          <p className="flex gap-2">
            <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            {address || "No address"}
          </p>
          {job.tech_name && (
            <p className="flex gap-2">
              <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              {job.tech_name}
              {job.eta ? `, ${job.eta}` : ""}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {phone ? (
            <a href={`tel:${phone}`} className={cx(big, "bg-brand-600 text-white hover:bg-brand-700")}>
              <Icon name="phone" className="h-5 w-5" /> Call {first ?? "customer"}
            </a>
          ) : (
            <span className={cx(big, "bg-gray-100 text-gray-400 shadow-none")}>No phone number</span>
          )}
          {address ? (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className={cx(big, "bg-ink-900 text-white hover:bg-ink-800")}
            >
              <Icon name="pin" className="h-5 w-5" /> Navigate
            </a>
          ) : (
            <span className={cx(big, "bg-gray-100 text-gray-400 shadow-none")}>No address</span>
          )}
        </div>
        {phone && <p className="mt-2 text-center text-xs text-gray-500">{formatPhone(job.callback_phone)}</p>}
      </Card>

      {summary && (
        <Card className="p-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Icon name="sparkle" className="h-3.5 w-3.5 text-brand-600" /> AI ticket
          </p>
          {summary.summary && <p className="text-base text-gray-800">{summary.summary}</p>}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {summary.likely_work && (<><dt className="text-gray-500">Likely work</dt><dd className="text-gray-900">{summary.likely_work}</dd></>)}
            {summary.safety_steps_taken && (<><dt className="text-gray-500">Safety</dt><dd className="text-gray-900">{summary.safety_steps_taken}</dd></>)}
            {summary.customer_mood && (<><dt className="text-gray-500">Caller</dt><dd className="text-gray-900">{summary.customer_mood}</dd></>)}
            {summary.language && (<><dt className="text-gray-500">Language</dt><dd className="text-gray-900">{summary.language}</dd></>)}
          </dl>
        </Card>
      )}

      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment</p>
        <JobBilling job={job} onChanged={load} large />
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Activity</p>
        <ol className="relative space-y-3.5 border-l border-gray-200 pl-4">
          {timeline.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-white" />
              <p className="text-sm text-gray-800">{e.text}</p>
              <p className="text-xs text-gray-400" suppressHydrationWarning>
                {new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
