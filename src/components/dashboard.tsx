"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job } from "@/lib/db";
import { dollars } from "@/lib/format";
import { JobPanel } from "./job-panel";
import { JobsGrid } from "./jobs-grid";
import { Card, Icon } from "./ui";

/** The owner's command center: live numbers, every job, and the selected job's money actions. */

const SECURED = new Set(["hold_placed", "card_saved", "dispatched"]);

export function Dashboard({ initialJobId }: { initialJobId: string | null }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/jobs", { cache: "no-store" });
    if (res.ok) setJobs(((await res.json()) as { jobs: Job[] }).jobs);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const secured = jobs.filter((j) => j.authorization_id || j.vault_id || j.captured_cents > 0).length;
    const answered = jobs.length;
    return [
      { label: "Calls answered", value: String(answered), note: "after hours", icon: "phone" as const },
      { label: "Visits secured", value: String(secured), note: answered ? `${Math.round((secured / answered) * 100)}% of calls` : "no calls yet", icon: "shield" as const },
      {
        label: "Secured, not charged",
        value: dollars(jobs.filter((j) => SECURED.has(j.status)).reduce((s, j) => s + j.fee_cents, 0)),
        note: "holds and cards on file",
        icon: "clock" as const,
      },
      { label: "Collected", value: dollars(jobs.reduce((s, j) => s + (j.captured_cents ?? 0), 0)), note: "through PayPal", icon: "dollar" as const },
    ];
  }, [jobs]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{s.label}</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-200">
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.note}</p>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <JobsGrid jobs={jobs} loaded={loaded} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="xl:sticky xl:top-6">
          <JobPanel key={selected?.id ?? "none"} job={selected} onChanged={load} />
        </div>
      </div>
    </div>
  );
}
