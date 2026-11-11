import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BalancePay } from "@/components/balance-pay";
import { BUSINESS } from "@/lib/business";
import { getJob } from "@/lib/db";
import { dollars } from "@/lib/format";

export const metadata = { title: "Pay your balance · Harbor Plumbing & Heating" };

/** What the homeowner opens from the text: the repair balance, payable with PayPal, Venmo, card or Pay Later. */
async function Bill({ params }: { params: PageProps<"/pay/[id]">["params"] }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job || !job.final_cents) notFound();
  return (
    <>
      <div>
        <p className="text-sm text-slate-500">{BUSINESS.name}</p>
        <h1 className="text-2xl font-semibold text-slate-950">Hi {job.customer_name ?? "there"}, here&apos;s your repair bill</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <div className="flex justify-between py-1">
          <span className="text-slate-600">Repair total</span>
          <span className="font-medium">{dollars(job.final_cents)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-600">Service-call hold, already charged</span>
          <span>−{dollars(job.captured_cents - (job.status === "paid" ? (job.balance_cents ?? 0) : 0))}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-slate-100 pt-3 text-base">
          <span className="font-semibold">Balance</span>
          <span className="font-semibold">{dollars(job.status === "paid" ? 0 : job.balance_cents)}</span>
        </div>
      </div>
      <BalancePay jobId={job.id} clientId={process.env.PAYPAL_CLIENT_ID ?? ""} orderId={job.balance_order_id} paid={job.status === "paid"} balance={dollars(job.balance_cents)} />
    </>
  );
}

export default function PayPage({ params }: PageProps<"/pay/[id]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />}>
        <Bill params={params} />
      </Suspense>
    </main>
  );
}
