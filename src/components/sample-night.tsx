"use client";

import { useState } from "react";
import { Button, cx } from "./ui";

/**
 * Fills the workspace with last night's sample calls (real PayPal sandbox transactions), or clears
 * them. `onChange` reloads whatever list is showing.
 */
export function SampleNightButton({ loaded, onChange, className }: { loaded: boolean; onChange: () => void | Promise<void>; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/samples", { method: loaded ? "DELETE" : "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(body.error ?? "That didn't work. Try again.");
    setBusy(false);
    await onChange();
  };

  return (
    <div className={cx("flex flex-col items-start gap-1", className)}>
      <Button type="button" variant="secondary" onClick={() => void run()} disabled={busy}>
        {busy ? (loaded ? "Clearing…" : "Running it through PayPal…") : loaded ? "Clear the sample night" : "Load a sample night"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
