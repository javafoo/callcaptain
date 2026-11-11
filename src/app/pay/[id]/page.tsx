import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApproveBill } from "@/components/approve-bill";
import { ApproveWatch } from "@/components/approve-watch";
import { BalancePay } from "@/components/balance-pay";
import { NothingChargedView, ReceiptView, SecuredView } from "@/components/receipt-view";
import { SaveCardPage } from "@/components/save-card-page";
import { getJob } from "@/lib/db";
import { dollars } from "@/lib/format";
import { paymentsForJob, type Payment } from "@/lib/ledger";
import { approvalSummary, SECURED, securedWith } from "@/lib/money";
import { getBusiness } from "@/lib/settings";

export const metadata = { title: "Your bill" };

/** Money has moved and the job is closed: the page is the customer's receipt. */
const RECEIPT = new Set(["completed", "paid", "cancelled_fee", "refunded"]);

/**
 * The customer's page for one job, from the call to the receipt, no sign-in (the job's id is the
 * key): save a card on file, approve the final bill the technician sent, pay the balance above
 * the hold, then the itemized receipt.
 */
async function CustomerPage({ params }: { params: PageProps<"/pay/[id]">["params"] }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [b, payments] = await Promise.all([getBusiness(job.business_id), paymentsForJob(job.id).catch((): Payment[] => [])]);
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";

  // Card on file requested: the same secure PayPal form the call screen shows.
  if (job.status === "awaiting_card") return <SaveCardPage job={job} businessName={b.businessName} clientId={clientId} />;

  if (RECEIPT.has(job.status)) return <ReceiptView job={job} business={b.businessName} payments={payments} />;

  // Approved a bill above the hold: the hold is applied and the balance is paid right here.
  if (job.status === "balance_due") {
    return (
      <ReceiptView job={job} business={b.businessName} payments={payments}>
        <BalancePay jobId={job.id} clientId={clientId} orderId={job.balance_order_id} paid={false} balance={dollars(job.balance_cents)} refresh />
      </ReceiptView>
    );
  }

  // The technician sent the final bill.
  const bill = await approvalSummary(job, b, payments);
  if (bill) return <ApproveBill jobId={job.id} bill={bill} clientId={clientId} via="link" />;

  // Secured and waiting for the final bill: it shows up here on its own.
  if (SECURED.has(job.status) || job.status === "awaiting_approval") {
    return (
      <SecuredView job={job} business={b.businessName} method={securedWith(job, payments)}>
        <ApproveWatch />
      </SecuredView>
    );
  }

  if (job.status === "released") {
    const card = job.secure_with === "card" && !job.authorization_id;
    return (
      <NothingChargedView
        job={job}
        business={b.businessName}
        title="Nothing charged"
        text={card ? "Your saved payment method was removed. Nothing was charged." : `Your ${dollars(job.fee_cents)} hold was released. Nothing was charged.`}
      />
    );
  }

  return <NothingChargedView job={job} business={b.businessName} title="Nothing to pay" text={`Nothing is due right now. ${b.businessName} sends your bill to this page after the visit.`} />;
}

export default function PayPage({ params }: PageProps<"/pay/[id]">) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Suspense fallback={<div className="h-[560px] animate-pulse rounded-2xl bg-gray-200/60" />}>
        <CustomerPage params={params} />
      </Suspense>
    </main>
  );
}
