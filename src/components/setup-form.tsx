"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGE_OPTIONS, shortName, type Business } from "@/lib/business";
import { dollars } from "@/lib/format";
import { VOICES } from "@/lib/voices";
import { Button, Card, CardHeader, Field, Icon, cx, inputClass } from "./ui";

type Form = {
  businessName: string;
  agentName: string;
  voiceId: string;
  services: string;
  serviceCallDollars: string;
  tripFeeDollars: string;
  serviceZips: string;
  technician: string;
  eta: string;
  morningSlot: string;
  languages: string[];
  instructions: string;
};

const toForm = (b: Business): Form => ({
  businessName: b.businessName,
  agentName: b.agentName,
  voiceId: b.voiceId,
  services: b.services,
  serviceCallDollars: String(b.serviceCallCents / 100),
  tripFeeDollars: String(b.tripFeeCents / 100),
  serviceZips: b.serviceZips.join(", "),
  technician: b.technician,
  eta: b.eta,
  morningSlot: b.morningSlot,
  languages: b.languages,
  instructions: b.instructions,
});

export function SetupForm({ initial }: { initial: Business }) {
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [saved, setSaved] = useState<Form>(() => toForm(initial));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => () => audio.current?.pause(), []);

  const play = (id: string) => {
    if (playing === id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(`/voices/${id}.mp3`);
    a.onended = () => setPlaying(null);
    audio.current = a;
    void a.play();
    setPlaying(id);
  };

  const submit = async (reset = false) => {
    setStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reset ? { reset: true } : { ...form, serviceZips: form.serviceZips }),
    });
    if (!res.ok) return setStatus("error");
    const next = toForm(((await res.json()) as { business: Business }).business);
    setForm(next);
    setSaved(next);
    setStatus("saved");
  };

  const fee = Math.round(Number(form.serviceCallDollars) * 100) || 0;
  const name = shortName({ ...initial, businessName: form.businessName });

  return (
    <form
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader title="Your business" subtitle="What callers hear, and what you do." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Business name">
              <input className={inputClass} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
            </Field>
            <Field label="What you do" hint="In your own words. The agent uses this to know what it can help with.">
              <input className={inputClass} value={form.services} onChange={(e) => set("services", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Your agent" subtitle="Name, voice and the languages it answers in." />
          <div className="space-y-5 p-5">
            <Field label="Agent name" className="max-w-xs">
              <input className={inputClass} value={form.agentName} onChange={(e) => set("agentName", e.target.value)} />
            </Field>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Voice</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {VOICES.map((v) => {
                  const selected = form.voiceId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={cx(
                        "flex items-center gap-3 rounded-lg border p-2.5 transition",
                        selected ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => play(v.id)}
                        className={cx(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
                          playing === v.id ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                        )}
                        aria-label={`${playing === v.id ? "Stop" : "Play"} ${v.name}`}
                      >
                        <Icon name={playing === v.id ? "pause" : "play"} className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => set("voiceId", v.id)} className="min-w-0 flex-1 text-left" title={v.description}>
                        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                          {v.name}
                          {selected && <Icon name="check" className="h-3.5 w-3.5 text-brand-600" />}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {v.gender === "female" ? "Female" : "Male"} · {v.accent} · {v.description}
                        </p>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Languages</p>
              <p className="mb-2 text-xs text-gray-500">The agent answers in the caller&apos;s language and switches live if they switch.</p>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((l) => {
                  const on = form.languages.includes(l.code);
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => set("languages", on ? form.languages.filter((c) => c !== l.code) : [...form.languages, l.code])}
                      className={cx(
                        "rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition",
                        on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50",
                      )}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pricing" subtitle="Held through PayPal on the call, charged only after the job." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="After-hours service call" hint="Placed as a PayPal hold. Goes toward the repair.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input className={cx(inputClass, "pl-7")} inputMode="decimal" value={form.serviceCallDollars} onChange={(e) => set("serviceCallDollars", e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
            </Field>
            <Field label="Trip fee if they cancel after dispatch" hint="Kept from the hold; the rest is released. Can't exceed the service call.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input className={cx(inputClass, "pl-7")} inputMode="decimal" value={form.tripFeeDollars} onChange={(e) => set("tripFeeDollars", e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Where and who" subtitle="The agent won't dispatch outside your area." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Service area ZIP codes" hint="Full ZIPs or the first 3 digits (951 covers 95100 to 95199). Leave empty to go anywhere." className="sm:col-span-2">
              <input className={inputClass} value={form.serviceZips} onChange={(e) => set("serviceZips", e.target.value)} placeholder="950, 951, 94086" />
            </Field>
            <Field label="On-call technician">
              <input className={inputClass} value={form.technician} onChange={(e) => set("technician", e.target.value)} />
            </Field>
            <Field label="Arrival window">
              <input className={inputClass} value={form.eta} onChange={(e) => set("eta", e.target.value)} />
            </Field>
            <Field label="First morning slot" hint="Offered when a caller doesn't want the hold." className="sm:col-span-2">
              <input className={inputClass} value={form.morningSlot} onChange={(e) => set("morningSlot", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Anything else the agent should know" subtitle="Policies, goals, things to always mention or never do." />
          <div className="p-5">
            <textarea
              rows={4}
              className={inputClass}
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder="We don't do commercial jobs. Always mention our one-year warranty."
            />
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6">
        <Card>
          <CardHeader title="Preview" subtitle="How the next call starts." />
          <div className="space-y-4 p-5 text-sm">
            <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 text-gray-800">
              Thanks for calling {name}&apos;s after-hours line. I&apos;m {form.agentName || "your agent"}, the AI dispatcher. What&apos;s going on?
            </div>
            <ul className="space-y-2 text-gray-600">
              <li className="flex gap-2">
                <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> Holds {dollars(fee)} through PayPal before dispatching
              </li>
              <li className="flex gap-2">
                <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {form.serviceZips.trim() ? `Only dispatches to ZIPs starting ${form.serviceZips}` : "Dispatches anywhere"}
              </li>
              <li className="flex gap-2">
                <Icon name="globe" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Speaks {LANGUAGE_OPTIONS.filter((l) => form.languages.includes(l.code)).map((l) => l.label).join(", ") || "English"}
              </li>
              <li className="flex gap-2">
                <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> Sends {form.technician || "your tech"}, {form.eta}
              </li>
            </ul>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={!dirty || status === "saving"}>
              {status === "saving" ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void submit(true)} disabled={status === "saving"}>
              Reset to the demo business
            </Button>
            <p className={cx("text-center text-xs", status === "error" ? "text-red-600" : "text-gray-500")}>
              {status === "saved" && !dirty ? "Saved. Your next call uses these settings." : status === "error" ? "Couldn't save. Try again." : dirty ? "You have unsaved changes." : "Changes apply to the next call."}
            </p>
          </div>
        </Card>
      </div>
    </form>
  );
}
