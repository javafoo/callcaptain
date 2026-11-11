"use client";

import { useEffect, useState } from "react";
import type { Payment } from "@/lib/ledger";
import { dollars } from "@/lib/format";
import { Card, CardHeader } from "./ui";

/** Every PayPal money movement in the workspace: holds, captures, releases, cards saved or charged, refunds. */
export function PaymentsLedger() {
  const [payments, setPayments] = useState<Payment[]>([]);
  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/payments", { cache: "no-store" });
      if (res.ok) setPayments(((await res.json()) as { payments: Payment[] }).payments);
    };
    const first = setTimeout(load, 0);
    const t = setInterval(load, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return (
    <Card>
      <CardHeader title="PayPal ledger" subtitle={`${payments.length} movements`} />
      <ul className="divide-y divide-gray-100 text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex justify-between px-5 py-2">
            <span>{p.kind}</span>
            <span className="tabular-nums">{dollars(p.amount_cents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
