"use client";

import { useState } from "react";
import { PayPalPay } from "./paypal-hold";

export function BalancePay({ jobId, clientId, orderId, paid, balance }: { jobId: string; clientId: string; orderId: string | null; paid: boolean; balance: string }) {
  const [done, setDone] = useState(paid);
  if (done) {
    return <div className="rounded-2xl bg-emerald-50 p-5 text-center text-emerald-900 ring-1 ring-emerald-200"><p className="text-lg font-semibold">Paid in full. Thank you!</p><p className="text-sm">A receipt is on its way from PayPal.</p></div>;
  }
  if (!orderId) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">Pay the {balance} balance with PayPal, Venmo or a card. On eligible amounts you can split it with PayPal Pay Later.</p>
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
