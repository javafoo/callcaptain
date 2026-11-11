"use client";

import { useState } from "react";
import type { Job } from "@/lib/db";
import { SaveCardOnFile } from "./card-on-file";
import { Icon } from "./ui";

/** /pay/[id] while a card on file is requested: the caller can also finish from this link. */
export function SaveCardPage({ job: initial, businessName, clientId }: { job: Job; businessName: string; clientId: string }) {
  const [job, setJob] = useState(initial);
  const saved = job.status !== "awaiting_card";
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(16,24,40,0.08)] ring-1 ring-gray-200">
      <div className="bg-ink-900 px-6 py-6 text-white">
        <p className="font-semibold">{businessName}</p>
        <p className="mt-4 text-2xl font-semibold tracking-tight">{saved ? "You're all set" : "Keep a card on file"}</p>
        <p className="mt-1 text-sm text-ink-300">Nothing is charged tonight. You approve the final price with the technician first.</p>
      </div>
      <div className="px-6 py-5">
        {saved ? (
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-brand-700 ring-1 ring-brand-200">
            <Icon name="check" className="h-5 w-5" />
            <p className="font-semibold">Saved with PayPal. $0 charged.</p>
          </div>
        ) : (
          <SaveCardOnFile clientId={clientId} jobId={job.id} onSaved={setJob} />
        )}
      </div>
      <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-500">
        <Icon name="shield" className="h-3.5 w-3.5" /> Secured by PayPal · sandbox demo
      </div>
    </div>
  );
}
