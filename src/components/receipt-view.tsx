import type { ReactNode } from "react";
import { TIMEZONE } from "@/lib/business";
import type { Job } from "@/lib/db";
import { dollars, shortId } from "@/lib/format";
import type { Payment } from "@/lib/ledger";
import { friendlyMethod, workDescription } from "@/lib/money";
import { BillRow, BillSection, BillShell } from "./receipt-shell";
import { Icon } from "./ui";

/**
 * The customer's receipt (server only): what the work cost, every PayPal payment with its
 * method, date and reference, what the hold released, refunds, and the total paid. The same
 * view shows a balance still due, with the PayPal buttons passed in as children.
 */

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TIMEZONE, month: "short", day: "numeric", year: "numeric" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: TIMEZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Line = { label: string; sub?: string | null; cents: number; kind: "paid" | "refund" | "released" };

function itemsOf(job: Job, payments: Payment[]): { label: string; sub?: string | null; cents: number }[] {
  const work = workDescription(job);
  if (job.status === "cancelled_fee" || payments.some((p) => p.kind === "trip_fee")) {
    return [{ label: "Trip fee", cents: job.final_cents ?? job.captured_cents }];
  }
  if (!job.final_cents) return [];
  if (job.final_cents > job.fee_cents) {
    return [
      { label: "After-hours service call", cents: job.fee_cents },
      { label: "Repair, parts and labor", sub: work, cents: job.final_cents - job.fee_cents },
    ];
  }
  return [{ label: "After-hours service call and repair", sub: work, cents: job.final_cents }];
}

function paymentsOf(job: Job, payments: Payment[]): Line[] {
  const onHold = Boolean(job.authorization_id);
  const lines: Line[] = [];
  // What the hold didn't take goes right under the charge from the hold.
  const released = (fromHold: number) => {
    if (onHold && job.fee_cents > fromHold) lines.push({ label: "Released from your hold, never charged", cents: job.fee_cents - fromHold, kind: "released" });
  };
  for (const p of payments) {
    const method = p.method ? friendlyMethod(p.method) : "PayPal";
    const sub = [method, when(p.created_at), p.paypal_id ? `PayPal ref ${p.paypal_id}` : null].filter(Boolean).join(" · ");
    if (p.kind === "hold_capture") {
      lines.push({ label: `From your ${dollars(job.fee_cents)} hold`, sub, cents: p.amount_cents, kind: "paid" });
      released(p.amount_cents);
    } else if (p.kind === "trip_fee") {
      lines.push({ label: onHold ? `Trip fee, from your ${dollars(job.fee_cents)} hold` : "Trip fee, charged to your saved payment method", sub, cents: p.amount_cents, kind: "paid" });
      released(p.amount_cents);
    } else if (p.kind === "balance") lines.push({ label: "Balance", sub, cents: p.amount_cents, kind: "paid" });
    else if (p.kind === "card_charge") lines.push({ label: "Charged to your saved payment method, with your approval", sub, cents: p.amount_cents, kind: "paid" });
    else if (p.kind === "refund") lines.push({ label: "Refund", sub, cents: p.amount_cents, kind: "refund" });
  }
  // A payment the ledger missed still shows, from the job's own totals.
  if (!lines.some((l) => l.kind === "paid") && job.captured_cents > 0) lines.unshift({ label: "Paid through PayPal", cents: job.captured_cents, kind: "paid" });
  return lines;
}

export function ReceiptView({ job, business, payments, children }: { job: Job; business: string; payments: Payment[]; children?: ReactNode }) {
  const items = itemsOf(job, payments);
  const lines = paymentsOf(job, payments);
  const net = job.captured_cents - job.refunded_cents;
  const due = job.status === "balance_due";
  const fullyRefunded = job.status === "refunded" || (job.refunded_cents > 0 && net <= 0);
  const cancelled = job.status === "cancelled_fee" || payments.some((p) => p.kind === "trip_fee");
  const name = job.customer_name?.split(" ")[0];
  const tech = job.tech_name ?? "Your technician";

  return (
    <BillShell
      business={business}
      meta={`${due ? "Bill" : "Receipt"} ${shortId(job.id)} · ${day(job.completed_at ?? job.updated_at)}`}
      label={due ? "Balance due" : fullyRefunded ? "Refunded" : "Paid"}
      amount={dollars(due ? job.balance_cents : fullyRefunded ? job.refunded_cents : net)}
      note={!due && !fullyRefunded && job.refunded_cents > 0 ? `After a ${dollars(job.refunded_cents)} refund` : undefined}
    >
      <p className="text-sm text-gray-600">
        {name ? `Thanks, ${name}. ` : "Thank you. "}
        {cancelled ? `Your visit was cancelled after ${tech} was already on the way.` : `${tech} finished the work.`}
        {job.issue && !cancelled ? <span className="mt-1 block text-gray-500">You called about: {job.issue.replace(/\.$/, "")}.</span> : null}
      </p>

      {items.length > 0 && (
        <BillSection title={cancelled ? "Charge" : "The work"}>
          {items.map((i) => (
            <BillRow key={i.label} label={i.label} sub={i.sub} amount={dollars(i.cents)} />
          ))}
          {items.length > 1 && <BillRow label="Total" amount={dollars(job.final_cents)} strong />}
        </BillSection>
      )}

      <BillSection title="Payments">
        {lines.map((l, i) => (
          <BillRow
            key={i}
            label={l.label}
            sub={l.sub}
            amount={l.kind === "refund" ? `−${dollars(l.cents)}` : dollars(l.cents)}
            muted={l.kind === "released"}
          />
        ))}
        {due ? (
          <BillRow label="Balance due" amount={dollars(job.balance_cents)} strong />
        ) : (
          <BillRow label={fullyRefunded ? "Total paid after refunds" : "Total paid"} amount={dollars(Math.max(net, 0))} strong />
        )}
      </BillSection>

      {children && <div className="mt-6">{children}</div>}

      {job.payer_email && !due && (
        <p className="mt-5 flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <Icon name="check" className="mt-px h-3.5 w-3.5 shrink-0 text-brand-600" />
          PayPal also emailed a receipt to {job.payer_email}.
        </p>
      )}
    </BillShell>
  );
}

/** Before the final bill: the visit is secured and nothing more is charged until the customer approves. */
export function SecuredView({ job, business, method, children }: { job: Job; business: string; method: string; children?: ReactNode }) {
  const card = job.secure_with === "card" && !job.authorization_id;
  return (
    <BillShell business={business} meta={`Visit ${shortId(job.id)}`} label={card ? "Charged so far" : "On hold, not charged"} amount={card ? "$0" : dollars(job.fee_cents)}>
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
        <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <div className="text-sm">
          <p className="font-semibold text-brand-700">Your visit is secured</p>
          <p className="mt-0.5 text-gray-600">
            {card ? `${method} is saved with PayPal. Nothing has been charged.` : `${dollars(job.fee_cents)} is on hold with ${method}. Nothing has been charged.`}
          </p>
        </div>
      </div>
      {job.status === "dispatched" && job.tech_name && (
        <p className="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          {job.tech_name} is on the way{job.eta ? `, arriving in ${job.eta}` : ""}.
        </p>
      )}
      <p className="mt-4 text-sm text-gray-600">When the work is done, the final bill appears right here. Nothing is charged until you approve it.</p>
      {children}
    </BillShell>
  );
}

/** Released or cancelled for free: nothing was charged. */
export function NothingChargedView({ job, business, title, text }: { job: Job; business: string; title: string; text: string }) {
  return (
    <BillShell business={business} meta={`Visit ${shortId(job.id)} · ${day(job.updated_at)}`} label={title} amount="$0">
      <p className="text-sm text-gray-600">{text}</p>
    </BillShell>
  );
}
