import { after } from "next/server";
import type { Job } from "./db";

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

/** Delivery channels plug in here. */
async function deliver(notice: Notice): Promise<void> {
  console.log("[notify]", notice.businessId, notice.kind, notice.title);
}
