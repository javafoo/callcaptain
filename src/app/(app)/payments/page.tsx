import { PaymentsLedger } from "@/components/payments-ledger";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Payments · Call Captain" };

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        title="Payments"
        description="Every PayPal money movement: holds placed, charged or released, cards saved or charged, balances paid and refunds. Export it for your bookkeeper."
      />
      <PaymentsLedger />
    </>
  );
}
