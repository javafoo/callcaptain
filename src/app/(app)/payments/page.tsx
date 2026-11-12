import { PaymentsLedger } from "@/components/payments-ledger";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        title="Payments"
        description="Every PayPal money movement: cards saved and charged, trip fees, holds, balances paid and refunds. Export it for your bookkeeper."
      />
      <PaymentsLedger />
    </>
  );
}
