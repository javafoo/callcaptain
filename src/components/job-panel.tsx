"use client";

import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useState } from "react";
import type { Job } from "@/lib/db";
import { shortId } from "@/lib/format";
import { JobBilling, useOrigin } from "./job-billing";
import { StatusPill } from "./status-pill";
import { Card, Icon } from "./ui";

/** The selected job: the call, the AI ticket, every PayPal step, and the owner's money actions. */

export function JobPanel({ job, onChanged }: { job: Job | null; onChanged: () => Promise<void> }) {
  if (!job) {
    return (
      <Card className="flex min-h-64 flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-gray-400 ring-1 ring-gray-200">
          <Icon name="jobs" className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-gray-900">No job selected</p>
        <p className="text-sm text-gray-500">Pick a job to see the call, the AI ticket and every PayPal step.</p>
      </Card>
    );
  }

  const summary = job.summary as Record<string, string> | null;
  const timeline = job.events.filter((e) => e.kind !== "caller" && e.kind !== "agent_said").slice().reverse();
  const card = job.secure_with === "card" && !job.authorization_id;
  const evidence = job.approval_evidence as { ip?: string | null; user_agent?: string | null } | null;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">Job {shortId(job.id)}</p>
            <h2 className="truncate text-lg font-semibold text-gray-900">{job.customer_name ?? "Unknown caller"}</h2>
          </div>
          <StatusPill status={job.status} />
        </div>
        <div className="mt-3 space-y-1.5 text-sm text-gray-600">
          <p className="flex gap-2">
            <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            {job.service_address ?? "No address"} {job.zip && !job.service_address?.includes(job.zip) ? job.zip : ""}
          </p>
          <p className="flex gap-2">
            <Icon name="wrench" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            {job.issue ?? "No problem described"}
          </p>
          {job.tech_name && (
            <p className="flex gap-2">
              <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              {job.tech_name}, {job.eta}
            </p>
          )}
        </div>
        <OpenOnPhone job={job} />
      </div>

      {summary && (
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Icon name="sparkle" className="h-3.5 w-3.5 text-brand-600" /> AI ticket for the tech
          </p>
          <p className="text-sm text-gray-800">{summary.summary}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {summary.likely_work && (<><dt className="text-gray-500">Likely work</dt><dd className="text-gray-800">{summary.likely_work}</dd></>)}
            {summary.safety_steps_taken && (<><dt className="text-gray-500">Safety</dt><dd className="text-gray-800">{summary.safety_steps_taken}</dd></>)}
            {summary.language && (<><dt className="text-gray-500">Language</dt><dd className="text-gray-800">{summary.language}</dd></>)}
          </dl>
        </div>
      )}

      <div className="border-b border-gray-100 px-5 py-4">
        <JobBilling job={job} onChanged={onChanged} />
      </div>

      <div className="px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Activity</p>
        <ol className="relative space-y-3.5 border-l border-gray-200 pl-4">
          {timeline.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-4 ring-white" />
              <p className="text-sm text-gray-800">{e.text}</p>
              <p className="text-xs text-gray-400">{new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
            </li>
          ))}
        </ol>
        {(job.order_id || job.authorization_id || job.vault_id || job.approved_at) && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-gray-50 p-3 font-mono text-[11px] text-gray-500">
            {job.order_id && (<><dt>PayPal order</dt><dd className="truncate">{job.order_id}</dd></>)}
            {job.authorization_id && (<><dt>Authorization</dt><dd className="truncate">{job.authorization_id}</dd></>)}
            {job.vault_id && (<><dt>Vault token</dt><dd className="truncate">{job.vault_id}</dd></>)}
            {job.balance_order_id && (<><dt>{card ? "Charge order" : "Balance order"}</dt><dd className="truncate">{job.balance_order_id}</dd></>)}
            {job.authorization_expires && (<><dt>Hold valid to</dt><dd>{new Date(job.authorization_expires).toLocaleDateString()}</dd></>)}
            {job.approved_at && (
              <>
                <dt>Approved</dt>
                <dd className="truncate" title={evidence?.user_agent ?? undefined}>
                  {new Date(job.approved_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}
                  {evidence?.ip ? ` · ${evidence.ip}` : ""}
                  {evidence?.user_agent ? ` · ${device(evidence.user_agent)}` : ""}
                </dd>
              </>
            )}
          </dl>
        )}
      </div>
    </Card>
  );
}

/** A short name for the device the customer approved on. */
function device(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Linux/.test(ua)) return "Linux";
  return ua.split(/[\s/]/)[0] || "Browser";
}

/**
 * The technician's phone view of this job (/jobs/[id]). The code carries the workspace, so the
 * phone opens the same jobs; the public demo line's workspace can't travel that way.
 */
function OpenOnPhone({ job }: { job: Job }) {
  const origin = useOrigin();
  const [open, setOpen] = useState(false);
  const url = origin ? `${origin}/jobs/${job.id}${job.business_id !== "demo" ? `?workspace=${job.business_id}` : ""}` : "";
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3 text-sm">
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-600" aria-expanded={open}>
          <Icon name="phone" className="h-4 w-4" /> Open on phone
        </button>
        <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700">
          Job page <Icon name="external" className="h-3.5 w-3.5" />
        </Link>
      </div>
      {open && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-gray-50 p-3 ring-1 ring-gray-200">
          <div className="h-[104px] w-[104px] shrink-0 rounded bg-white p-1">
            {url ? <QRCodeSVG value={url} size={96} title="Open this job on your phone" /> : null}
          </div>
          <p className="text-xs text-gray-600">
            Scan with the technician&apos;s phone camera: call the customer, get directions, send the final bill and get paid on site.
          </p>
        </div>
      )}
    </div>
  );
}
