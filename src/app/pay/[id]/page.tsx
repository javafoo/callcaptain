import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BalancePay } from "@/components/balance-pay";
import { Icon } from "@/components/ui";
import { getJob } from "@/lib/db";
import { dollars, shortId } from "@/lib/format";
import { getBusiness } from "@/lib/settings";

export const metadata = { title: "Your invoice" };

/** What the homeowner opens from the text: the repair balance, payable with PayPal, Venmo, card or Pay Later. */
async function Invoice({ params }: { params: PageProps<"/pay/[id]">["params"] }) {
  const { id } = await params;
  const [job, b] = await Promise.all([getJob(id), getBusiness()]);
  if (!job || !job.final_cents) notFound();
  const paid = job.status === "paid";
  const heldPaid = job.final_cents - (job.balance_cents ?? 0);
  const issued = new Date(job.updated_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(16,24,40,0.08)] ring-1 ring-gray-200">
      <div className="bg-ink-900 px-6 py-6 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Icon name="wrench" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold">{b.businessName}</p>
            <p className="text-xs text-ink-300">Invoice {shortId(job.id)} · {issued}</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-ink-300">{paid ? "Paid in full" : "Balance due"}</p>
        <p className="text-4xl font-semibold tracking-tight">{dollars(paid ? job.final_cents : job.balance_cents)}</p>
      </div>

      <div className="px-6 py-5">
        <p className="text-sm text-gray-600">
          Hi {job.customer_name ?? "there"}, thanks for trusting us with {job.issue ? <span className="text-gray-900">&ldquo;{job.issue.replace(/\.$/, "")}&rdquo;</span> : "your repair"}.
          {job.tech_name ? ` ${job.tech_name} finished the work.` : ""}
        </p>

        <table className="mt-5 w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="py-2.5 text-gray-600">Repair, parts and labor</td>
              <td className="py-2.5 text-right tabular-nums text-gray-900">{dollars(job.final_cents)}</td>
            </tr>
            <tr>
              <td className="py-2.5 text-gray-600">Service-call hold, already charged</td>
              <td className="py-2.5 text-right tabular-nums text-gray-900">−{dollars(heldPaid)}</td>
            </tr>
            <tr>
              <td className="pt-3 font-semibold text-gray-900">{paid ? "Paid" : "Balance"}</td>
              <td className="pt-3 text-right text-base font-semibold tabular-nums text-gray-900">{dollars(paid ? job.balance_cents : job.balance_cents)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6">
          <BalancePay jobId={job.id} clientId={process.env.PAYPAL_CLIENT_ID ?? ""} orderId={job.balance_order_id} paid={paid} balance={dollars(job.balance_cents)} />
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-500">
        <Icon name="shield" className="h-3.5 w-3.5" /> Payments secured by PayPal · sandbox demo
      </div>
    </div>
  );
}

export default function PayPage({ params }: PageProps<"/pay/[id]">) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Suspense fallback={<div className="h-[560px] animate-pulse rounded-2xl bg-gray-200/60" />}>
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}
