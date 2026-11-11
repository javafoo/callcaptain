"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGE_OPTIONS, shortName, type Business, type County } from "@/lib/business";
import { dollars } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { VOICES } from "@/lib/voices";
import { Button, Card, CardHeader, Field, Icon, cx, inputClass } from "./ui";

type Form = {
  businessName: string;
  agentName: string;
  voiceId: string;
  services: string;
  serviceCallDollars: string;
  tripFeeDollars: string;
  secureWith: "hold" | "card";
  serviceZips: string;
  serviceAreaText: string;
  serviceCounties: County[];
  websiteUrl: string;
  knowledge: string;
  technician: string;
  technicianPhone: string;
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
  secureWith: b.secureWith,
  serviceZips: b.serviceZips.join(", "),
  serviceAreaText: b.serviceAreaText,
  serviceCounties: b.serviceCounties,
  websiteUrl: b.websiteUrl,
  knowledge: b.knowledge,
  technician: b.technician,
  technicianPhone: b.technicianPhone ? formatPhone(b.technicianPhone) : "",
  eta: b.eta,
  morningSlot: b.morningSlot,
  languages: b.languages,
  instructions: b.instructions,
});

export function SetupForm({ initial, editable }: { initial: Business; editable: boolean }) {
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [saved, setSaved] = useState<Form>(() => toForm(initial));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [importUrl, setImportUrl] = useState(initial.websiteUrl || "");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [mapping, setMapping] = useState(false);
  const [areaNote, setAreaNote] = useState<string | null>(null);
  // The area sentence the county chips were mapped from. If the sentence changes without a re-map, warn.
  const [mappedFor, setMappedFor] = useState(initial.serviceAreaText);
  const [origin, setOrigin] = useState("https://callcaptain.vercel.app");
  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);

  const importSite = async () => {
    setImporting(true);
    setImportNote(null);
    const res = await fetch("/api/settings/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: importUrl }) });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      pages?: string[];
      websiteUrl?: string;
      draft?: { businessName: string | null; services: string | null; serviceAreaText: string | null; serviceCallDollars: number | null; instructions: string | null; knowledge: string };
      area?: { counties: County[]; summary: string } | null;
    };
    setImporting(false);
    if (!res.ok || !body.draft) return setImportNote({ ok: false, text: body.error ?? "Couldn't read that website." });
    const d = body.draft;
    const counties = body.area?.counties.length ? body.area.counties : null;
    if (counties && d.serviceAreaText) setMappedFor(d.serviceAreaText);
    setAreaNote(counties ? `Mapped your area to ${counties.length} ${counties.length === 1 ? "county" : "counties"}. Remove any you don't cover.` : null);
    setForm((f) => ({
      ...f,
      businessName: d.businessName ?? f.businessName,
      services: d.services ?? f.services,
      serviceAreaText: d.serviceAreaText ?? f.serviceAreaText,
      serviceCounties: counties ?? f.serviceCounties,
      serviceCallDollars: d.serviceCallDollars ? String(d.serviceCallDollars) : f.serviceCallDollars,
      instructions: d.instructions ?? f.instructions,
      knowledge: d.knowledge || f.knowledge,
      websiteUrl: body.websiteUrl ?? f.websiteUrl,
    }));
    setImportNote({ ok: true, text: `Read ${body.pages?.length ?? 1} page${body.pages?.length === 1 ? "" : "s"}. Review the fields below${d.serviceAreaText && !counties ? ", map your service area" : ""}, then save.` });
  };

  const mapArea = async () => {
    setMapping(true);
    setAreaNote(null);
    const res = await fetch("/api/settings/area", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: form.serviceAreaText }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string; counties?: County[]; summary?: string };
    setMapping(false);
    if (!res.ok || !body.counties) return setAreaNote(body.error ?? "Couldn't map that area.");
    const text = body.summary || form.serviceAreaText;
    setMappedFor(text);
    setForm((f) => ({ ...f, serviceCounties: body.counties!, serviceAreaText: text }));
    setAreaNote(`Found ${body.counties.length} ${body.counties.length === 1 ? "county" : "counties"}. Remove any you don't cover, then save.`);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const areaStale = form.serviceAreaText.trim() !== "" && form.serviceAreaText !== mappedFor;
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
    if (!res.ok) {
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveError(out.error ?? null);
      return setStatus("error");
    }
    setSaveError(null);
    const out = (await res.json()) as { business: Business; remapped?: boolean };
    const next = toForm(out.business);
    setMappedFor(next.serviceAreaText);
    if (out.remapped) setAreaNote(`Your area text changed, so we re-mapped it to ${next.serviceCounties.length} ${next.serviceCounties.length === 1 ? "county" : "counties"}. Check them below.`);
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
        {!editable && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            This is the business behind the public demo phone line, so it&apos;s read-only. Open the app in a new browser to get your own workspace.
          </p>
        )}
        <Card className="border-brand-200 bg-gradient-to-br from-brand-50/70 to-white">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
            <div className="flex-1">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
                <Icon name="sparkle" className="h-4 w-4 text-brand-600" /> Set up from your website
              </p>
              <p className="mb-3 mt-0.5 text-sm text-gray-500">Paste your website. The AI reads it and fills in your services, service area, prices and policies, and learns your FAQs for calls.</p>
              <input
                className={inputClass}
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="harborplumbing.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (importUrl.trim() && !importing) void importSite();
                  }
                }}
              />
            </div>
            <Button type="button" onClick={() => void importSite()} disabled={!importUrl.trim() || importing} className="shrink-0">
              {importing ? "Reading your site…" : "Read my website"}
            </Button>
          </div>
          {importNote && <p className={cx("px-5 pb-4 text-sm", importNote.ok ? "text-brand-700" : "text-red-600")}>{importNote.text}</p>}
          {!importNote && (
            <p className="px-5 pb-4 text-xs text-gray-500">
              Try it with our demo contractor:{" "}
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setImportUrl(`${origin}/site`)}>
                {origin.replace(/^https?:\/\//, "")}/site
              </button>
            </p>
          )}
        </Card>

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
          <CardHeader title="Pricing and payment" subtitle="How a night visit is secured before the technician drives out." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2" role="radiogroup" aria-label="How to secure the visit">
              {(
                [
                  ["card", "Card on file", "The caller saves a card or PayPal with PayPal. $0 tonight. You charge the final bill after they approve it on site."],
                  ["hold", "Hold the service call", "PayPal holds the service-call amount on the call. Charged after the job; the rest is released."],
                ] as const
              ).map(([value, title, body]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.secureWith === value}
                  onClick={() => set("secureWith", value)}
                  className={cx(
                    "rounded-xl p-4 text-left ring-1 transition",
                    form.secureWith === value ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-gray-200 hover:ring-gray-300",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className={cx("h-4 w-4 rounded-full", form.secureWith === value ? "bg-brand-600 ring-4 ring-brand-100" : "ring-1 ring-gray-300")} />
                    {title}
                  </span>
                  <span className="mt-1 block text-sm text-gray-500">{body}</span>
                </button>
              ))}
            </div>
            <Field label="After-hours service call" hint={form.secureWith === "card" ? "Part of the final bill. Ava explains it on the call." : "Placed as a PayPal hold. Goes toward the repair."}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input className={cx(inputClass, "pl-7")} inputMode="decimal" value={form.serviceCallDollars} onChange={(e) => set("serviceCallDollars", e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
            </Field>
            <Field
              label="Trip fee if they cancel after dispatch"
              hint={form.secureWith === "card" ? "Charged to the card on file. Can't exceed the service call." : "Kept from the hold; the rest is released. Can't exceed the service call."}
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input className={cx(inputClass, "pl-7")} inputMode="decimal" value={form.tripFeeDollars} onChange={(e) => set("tripFeeDollars", e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Where and who" subtitle="The agent checks every caller's ZIP and won't dispatch outside your area." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-3 sm:col-span-2">
              <Field label="Service area, in your own words" hint={`A region, cities, counties, or "within 25 miles of 22101". The AI turns it into counties; the agent checks each caller's ZIP.`}>
                <div className="flex gap-2">
                  <input className={inputClass} value={form.serviceAreaText} onChange={(e) => set("serviceAreaText", e.target.value)} placeholder="Northern Virginia and DC" />
                  <Button type="button" variant="secondary" onClick={() => void mapArea()} disabled={!form.serviceAreaText.trim() || mapping} className="shrink-0">
                    {mapping ? "Mapping…" : "Map area"}
                  </Button>
                </div>
              </Field>
              {areaStale ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                  The counties below are from your old area. Click Map area, or Save and we&apos;ll map it for you.
                </p>
              ) : (
                areaNote && <p className="text-sm text-brand-700">{areaNote}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {form.serviceCounties.length === 0 && <p className="text-xs text-gray-500">No counties yet. Click Map area.</p>}
                {form.serviceCounties.map((c) => (
                  <span key={`${c.county}-${c.state}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                    {c.county}, {c.state}
                    <button
                      type="button"
                      onClick={() => set("serviceCounties", form.serviceCounties.filter((x) => x !== c))}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                      aria-label={`Remove ${c.county}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <Field label="Extra ZIP codes (optional)" hint="Full ZIPs or the first 3 digits. Leave the area and this empty to go anywhere.">
                <input className={inputClass} value={form.serviceZips} onChange={(e) => set("serviceZips", e.target.value)} placeholder="94086, 951" />
              </Field>
            </div>
            <Field label="On-call technician">
              <input className={inputClass} value={form.technician} onChange={(e) => set("technician", e.target.value)} />
            </Field>
            <Field label="Technician's cell" hint="When a visit is secured, the agent phones this number to brief the tech, who accepts by voice. Leave empty to skip the call.">
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.technicianPhone}
                onChange={(e) => set("technicianPhone", e.target.value)}
                placeholder="(408) 555-0199"
              />
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

        <Card>
          <CardHeader title="What the agent knows from your website" subtitle="Facts it can use to answer callers' questions. Edit freely." />
          <div className="p-5">
            <textarea
              rows={5}
              className={inputClass}
              value={form.knowledge}
              onChange={(e) => set("knowledge", e.target.value)}
              placeholder="Import your website above, or type facts here: hours, licenses, brands you service, warranties."
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-semibold text-gray-900">Ready for real calls?</p>
            <p className="mt-0.5 text-sm text-gray-500">Forward your after-hours line to the agent, add the call button to your website, and get alerts on your phone.</p>
          </div>
          <a href="/go-live" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-800">
            Go live <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6">
        <Card>
          <CardHeader title="Preview" subtitle="How the next call starts." />
          <div className="space-y-4 p-5 text-sm">
            <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 text-gray-800">
              {name}, this is {form.agentName || "your agent"}, the after-hours AI dispatcher. What&apos;s going on?
            </div>
            <ul className="space-y-2 text-gray-600">
              <li className="flex gap-2">
                <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {form.secureWith === "card" ? "Saves a card on file with PayPal before dispatching, $0 tonight" : `Holds ${dollars(fee)} through PayPal before dispatching`}
              </li>
              <li className="flex gap-2">
                <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {form.serviceCounties.length || form.serviceZips.trim() ? `Only dispatches in ${form.serviceAreaText || "your area"}` : "Dispatches anywhere"}
              </li>
              <li className="flex gap-2">
                <Icon name="globe" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Speaks {LANGUAGE_OPTIONS.filter((l) => form.languages.includes(l.code)).map((l) => l.label).join(", ") || "English"}
              </li>
              <li className="flex gap-2">
                <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {form.technicianPhone.replace(/\D/g, "").length >= 10
                  ? `Phones ${form.technician || "your tech"} to dispatch, ${form.eta}`
                  : `Sends ${form.technician || "your tech"}, ${form.eta}`}
              </li>
            </ul>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={!editable || !dirty || status === "saving"}>
              {status === "saving" ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void submit(true)} disabled={!editable || status === "saving"}>
              Reset to the demo business
            </Button>
            <p className={cx("text-center text-xs", status === "error" ? "text-red-600" : "text-gray-500")}>
              {status === "saved" && !dirty ? "Saved. Your next call uses these settings." : status === "error" ? (saveError ?? "Couldn't save. Try again.") : dirty ? "You have unsaved changes." : "Changes apply to the next call."}
            </p>
          </div>
        </Card>
      </div>
    </form>
  );
}
