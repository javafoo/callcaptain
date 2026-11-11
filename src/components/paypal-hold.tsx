"use client";

import {
  INSTANCE_LOADING_STATE,
  PayLaterOneTimePaymentButton,
  PayPalGuestPaymentButton,
  PayPalOneTimePaymentButton,
  PayPalProvider,
  VenmoOneTimePaymentButton,
  useEligibleMethods,
  usePayPal,
} from "@paypal/react-paypal-js/sdk-v6";
import { useState } from "react";

/**
 * PayPal JS SDK v6 buttons. The order already exists on the server (the agent created it,
 * intent AUTHORIZE, or the owner created the balance order), so each button just presents
 * it and hands the approved order id back to our server to authorize or capture.
 */

type Props = {
  clientId: string;
  orderId: string;
  /** Server call that finalizes the approved order (authorize the hold / capture the balance). */
  finalize: (orderId: string) => Promise<void>;
  /** Offer Pay Later (balance payments). Holds don't, because nothing is charged yet. */
  payLater?: boolean;
};

export function PayPalPay(props: Props) {
  return (
    <PayPalProvider
      clientId={props.clientId}
      environment="sandbox"
      components={["paypal-payments", "venmo-payments", "paypal-guest-payments"]}
      pageType="checkout"
    >
      <Buttons {...props} />
    </PayPalProvider>
  );
}

function Buttons({ orderId, finalize, payLater }: Props) {
  const { loadingStatus, error } = usePayPal();
  const { eligiblePaymentMethods, isLoading } = useEligibleMethods({
    payload: { purchase_units: [{ amount: { currency_code: "USD" } }] },
  } as Parameters<typeof useEligibleMethods>[0]);
  const [problem, setProblem] = useState<string | null>(null);

  if (loadingStatus === INSTANCE_LOADING_STATE.REJECTED) {
    return <p className="text-sm text-red-700">PayPal didn&apos;t load: {error?.message}</p>;
  }
  if (loadingStatus === INSTANCE_LOADING_STATE.PENDING || isLoading) {
    return <div className="h-12 animate-pulse rounded-full bg-slate-200" aria-label="Loading PayPal" />;
  }

  const common = {
    orderId,
    presentationMode: "auto" as const,
    onApprove: async ({ orderId: approved }: { orderId?: string }) => {
      setProblem(null);
      try {
        await finalize(approved ?? orderId);
      } catch (e) {
        // PayPal approved it but our server couldn't finish: say so instead of failing silently.
        setProblem(e instanceof Error ? e.message : "PayPal couldn't finish. Try again.");
      }
    },
    onError: (e: unknown) => setProblem(e instanceof Error ? e.message : "PayPal couldn't finish. Try again."),
  };

  return (
    <div className="flex flex-col gap-2">
      <PayPalOneTimePaymentButton {...common} type="pay" />
      {payLater && eligiblePaymentMethods?.isEligible("paylater") && <PayLaterOneTimePaymentButton {...common} />}
      {eligiblePaymentMethods?.isEligible("venmo") && <VenmoOneTimePaymentButton {...common} />}
      <PayPalGuestPaymentButton {...common} />
      {problem && <p className="text-sm text-red-700">{problem}</p>}
    </div>
  );
}
