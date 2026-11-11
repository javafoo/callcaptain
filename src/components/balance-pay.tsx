"use client";

import { useState } from "react";
import { PayPalPay } from "./paypal-hold";
import { Icon } from "./ui";

export function BalancePay({ jobId, clientId, orderId, paid, balance }: { jobId: string; clientId: string; orderId: string | null; paid: boolean; balance: string }) {
  const [done, setDone] = useState(paid);
  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-brand-700 ring-1 ring-brand-200">
        <Icon name="check" className="h-5 w-5" />
        <div>
          <p className="font-semibold">Paid in full. Thank you!</p>
          <p className="text-sm text-gray-600">PayPal is emailing your receipt.</p>
        </div>
      </div>
    );
  }
  if (!orderId) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">Pay the {balance} balance with PayPal, Venmo or a card. On eligible amounts you can split it into payments with PayPal Pay Later.</p>
      <PayPalPay
        clientId={clientId}
        orderId={orderId}
        payLater
        finalize={async (approved) => {
          const res = await fetch(`/api/jobs/${jobId}/balance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: approved }) });
          const body = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(body.error ?? "Payment didn't go through.");
          setDone(true);
        }}
      />
    </div>
  );
}
