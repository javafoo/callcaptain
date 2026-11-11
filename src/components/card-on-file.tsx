"use client";

import {
  INSTANCE_LOADING_STATE,
  PayPalCardCvvField,
  PayPalCardExpiryField,
  PayPalCardFieldsProvider,
  PayPalCardNumberField,
  PayPalProvider,
  PayPalSavePaymentButton,
  usePayPal,
  usePayPalCardFieldsSavePaymentSession,
} from "@paypal/react-paypal-js/sdk-v6";
import { useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/db";

/**
 * Card on file, on the caller's screen (PayPal JS SDK v6, "save payment without purchase").
 * Either button gets a setup token from our server, the caller approves it with PayPal, and
 * our server turns it into a saved payment method. Nothing is charged; the AI never sees the card.
 */

type Props = { clientId: string; jobId: string; onSaved: (job: Job) => void };

async function vault(jobId: string, body: Record<string, string>) {
  const res = await fetch(`/api/jobs/${jobId}/vault`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { setupToken?: string; job?: Job; error?: string };
  if (!res.ok) throw new Error(out.error ?? "PayPal couldn't save that. Try again.");
  return out;
}

export function SaveCardOnFile(props: Props) {
  return (
    <PayPalProvider clientId={props.clientId} environment="sandbox" components={["paypal-payments", "card-fields"]} pageType="checkout">
      <Inner {...props} />
    </PayPalProvider>
  );
}

function Inner({ jobId, onSaved }: Props) {
  const { loadingStatus, error } = usePayPal();
  const [problem, setProblem] = useState<string | null>(null);

  if (loadingStatus === INSTANCE_LOADING_STATE.REJECTED) return <p className="text-sm text-red-700">PayPal didn&apos;t load: {error?.message}</p>;
  if (loadingStatus === INSTANCE_LOADING_STATE.PENDING) return <div className="h-40 animate-pulse rounded-xl bg-slate-200/70" aria-label="Loading PayPal" />;

  const confirm = async (setupToken: string) => {
    setProblem(null);
    const { job } = await vault(jobId, { action: "confirm", setupToken });
    if (job) onSaved(job);
  };

  return (
    <div className="flex flex-col gap-3">
      <PayPalSavePaymentButton
        presentationMode="auto"
        createVaultToken={async () => ({ vaultSetupToken: (await vault(jobId, { action: "setup", kind: "paypal" })).setupToken! })}
        onApprove={async ({ vaultSetupToken }) => {
          await confirm(vaultSetupToken).catch((e: unknown) => setProblem(e instanceof Error ? e.message : "PayPal couldn't save that."));
        }}
        onError={(e: unknown) => setProblem(e instanceof Error ? e.message : "PayPal couldn't finish. Try again.")}
      />
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="h-px flex-1 bg-gray-200" /> or save a debit or credit card <span className="h-px flex-1 bg-gray-200" />
      </div>
      <PayPalCardFieldsProvider>
        <CardForm jobId={jobId} confirm={confirm} onProblem={setProblem} />
      </PayPalCardFieldsProvider>
      {problem && <p className="text-sm text-red-700">{problem}</p>}
    </div>
  );
}

const fieldStyle = {
  input: { "font-size": "15px", "font-family": "system-ui, -apple-system, sans-serif", color: "#101828", padding: "10px 12px" },
  ".invalid": { color: "#b42318" },
};

function CardForm({ jobId, confirm, onProblem }: { jobId: string; confirm: (token: string) => Promise<void>; onProblem: (m: string | null) => void }) {
  const { submit, submitResponse, error } = usePayPalCardFieldsSavePaymentSession();
  const [saving, setSaving] = useState(false);
  const handled = useRef<string | null>(null);

  // submit() reports through submitResponse; when PayPal says it succeeded, save the card on our side.
  useEffect(() => {
    if (!submitResponse) return;
    const token = submitResponse.data?.vaultSetupToken ?? "";
    if (handled.current === token + submitResponse.state) return;
    handled.current = token + submitResponse.state;
    const finish = async () => {
      try {
        if (submitResponse.state === "succeeded" && token) await confirm(token);
        else if (submitResponse.state === "failed") onProblem(submitResponse.data?.message ?? "That card didn't go through. Check the numbers and try again.");
      } catch (e) {
        onProblem(e instanceof Error ? e.message : "PayPal couldn't save that card.");
      } finally {
        setSaving(false);
      }
    };
    void finish();
  }, [submitResponse, confirm, onProblem]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => {
      onProblem(error.message);
      setSaving(false);
    }, 0);
    return () => clearTimeout(t);
  }, [error, onProblem]);

  const box = "overflow-hidden rounded-lg bg-white ring-1 ring-gray-300";
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        onProblem(null);
        void submit(vault(jobId, { action: "setup", kind: "card" }).then((r) => r.setupToken!)).catch((err: unknown) => {
          onProblem(err instanceof Error ? err.message : "PayPal couldn't save that card.");
          setSaving(false);
        });
      }}
    >
      <PayPalCardNumberField placeholder="Card number" style={fieldStyle} containerClassName={box} containerStyles={{ height: 46 }} />
      <div className="grid grid-cols-2 gap-2">
        <PayPalCardExpiryField placeholder="MM / YY" style={fieldStyle} containerClassName={box} containerStyles={{ height: 46 }} />
        <PayPalCardCvvField placeholder="CVV" style={fieldStyle} containerClassName={box} containerStyles={{ height: 46 }} />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="mt-1 rounded-full bg-ink-900 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save card"}
      </button>
    </form>
  );
}
