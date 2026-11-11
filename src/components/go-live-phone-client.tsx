"use client";

import { useState, type FormEvent } from "react";
import { formatPhone, toE164 } from "@/lib/phone";
import { Button, Icon, inputClass } from "./ui";

const MAX_PHONES = 5;

export function CopyNumber({ number }: { number: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(number).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/15"
    >
      {copied ? "Copied" : "Copy number"}
    </button>
  );
}

/** The owner's own phones. Saved with PATCH /api/settings { testPhones }, which merges and normalizes to E.164. */
export function TestPhones({ initial, line, editable }: { initial: string[]; line: string; editable: boolean }) {
  const [phones, setPhones] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  async function save(next: string[]): Promise<string[] | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testPhones: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { business?: { testPhones?: string[] }; error?: string };
      if (!res.ok || !body.business) throw new Error(body.error ?? "Couldn't save. Try again.");
      const saved = body.business.testPhones ?? [];
      setPhones(saved);
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const phone = toE164(draft);
    if (!phone) return setError("Enter a 10-digit US phone number.");
    if (phones.includes(phone)) return setError("That number is already on the list.");
    if (phones.length >= MAX_PHONES) return setError(`You can add up to ${MAX_PHONES} numbers. Remove one first.`);
    const saved = await save([...phones, phone]);
    if (saved?.includes(phone)) {
      setDraft("");
      setAdded(phone);
    }
  }

  async function remove(phone: string) {
    setAdded(null);
    await save(phones.filter((p) => p !== phone));
  }

  return (
    <div className="mt-4 space-y-3">
      {phones.length > 0 ? (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {phones.map((p) => (
            <li key={p} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium tabular-nums text-gray-900">
                <Icon name="phone" className="h-4 w-4 text-gray-400" />
                {formatPhone(p)}
              </span>
              {editable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(p)}
                  className="text-sm font-medium text-gray-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Remove ${formatPhone(p)}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">No numbers yet. Until you add yours, your calls to this line won&apos;t use your setup.</p>
      )}

      {editable ? (
        <form onSubmit={(e) => void add(e)} className="flex gap-2">
          <input
            className={inputClass}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(408) 555-0199"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            aria-label="Your phone number"
            disabled={busy || phones.length >= MAX_PHONES}
          />
          <Button type="submit" disabled={busy || !draft.trim() || phones.length >= MAX_PHONES} className="shrink-0">
            {busy ? "Saving…" : "Add"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-gray-500">You&apos;re viewing the public line&apos;s business, so these numbers can&apos;t be changed here.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {added && !error && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-200">
          <Icon name="check" className="h-4 w-4 shrink-0" />
          <span>
            Saved. Call{" "}
            <a href={`tel:${line}`} className="font-semibold underline">
              {formatPhone(line)}
            </a>{" "}
            from {formatPhone(added)} to try it.
          </span>
        </p>
      )}
    </div>
  );
}
