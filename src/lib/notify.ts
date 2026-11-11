import { after } from "next/server";
import type { Job } from "./db";
import { pushToWorkspace } from "./push";

/**
 * Alerts for the owner and technician: a new emergency, a visit secured with PayPal, a
 * dispatch, a call that needs a callback, money in. Fire and forget: it runs after the
 * response, so a slow alert never makes a caller wait, and it never throws.
 */

export type NotifyKind =
  | "new_call"
  | "secured"
  | "dispatched"
  | "tech_update"
  | "booked"
  | "follow_up"
  | "approved"
  | "paid"
  | "refunded"
  | "cancelled";

export type Notice = { kind: NotifyKind; title: string; body: string; jobId: string; businessId: string };

export function notify(job: Pick<Job, "id" | "business_id">, kind: NotifyKind, title: string, body: string): void {
  const notice: Notice = { kind, title, body, jobId: job.id, businessId: job.business_id };
  const send = () => deliver(notice).catch((e) => console.warn("[notify]", e instanceof Error ? e.message : e));
  try {
    after(send);
  } catch {
    void send(); // outside a request (scripts, tests)
  }
}

/**
 * Web Push to every phone and computer that turned on alerts for this workspace (Go live). Each job
 * has one notification that updates in place (tag), and one push topic, so a phone that was off
 * gets the latest news for each job instead of a backlog. The app shows the same moments as live
 * alerts while it's open (components/notifier.tsx). Never throws.
 */
async function deliver(notice: Notice): Promise<void> {
  try {
    const { sent, removed, failed } = await pushToWorkspace(
      notice.businessId,
      { title: notice.title, body: notice.body, url: `/dashboard?job=${notice.jobId}`, tag: `job-${notice.jobId}`, kind: notice.kind },
      notice.jobId.replace(/-/g, ""),
    );
    console.log("[notify]", notice.businessId, notice.kind, notice.title, `· push: ${sent} sent, ${removed} removed, ${failed} failed`);
  } catch (e) {
    console.warn("[notify]", notice.businessId, notice.kind, e instanceof Error ? e.message : e);
  }
}
