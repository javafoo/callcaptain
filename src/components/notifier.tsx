"use client";

import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { dollars } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { AlertFeed, AlertJob } from "@/lib/push";
import { currentSubscription, isStandalone, pushSupported, registerWorker, syncSubscription, turnOnAlerts } from "./push-client";
import { Button, Icon, cx } from "./ui";

/**
 * Live alerts in the owner app, mounted once in the app layout. It watches this workspace's jobs
 * (the light feed at /api/push/feed) and pops a toast for each moment that happens while the app
 * is open: a new call, a visit secured, a dispatch, the technician's answer, approvals, payments,
 * refunds, cancellations and callers to call back. Each moment shows once. A soft chime plays
 * after the owner has touched the page, and a hidden tab also gets a system notification unless
 * this device already receives push alerts. It also starts the service worker that push uses.
 */

/**
 * The test call page already shows the call live, and its PayPal box sits where toasts would
 * appear: moments that happen there count as seen, without a toast or chime.
 */
const quietPage = (path: string) => path === "/call" || path.startsWith("/call/");

const POLL_MS = 3500;
const POLL_HIDDEN_MS = 10_000;
const TOAST_MS = 12_000;
const MAX_TOASTS = 4;
const OFFER_KEY = "cc-alerts-offer";

type IconName = ComponentProps<typeof Icon>["name"];

const TONES = {
  urgent: { icon: "phone", badge: "bg-rose-50 text-rose-600 ring-rose-200" },
  call: { icon: "phone", badge: "bg-sky-50 text-sky-600 ring-sky-200" },
  secured: { icon: "shield", badge: "bg-brand-50 text-brand-600 ring-brand-200" },
  dispatched: { icon: "truck", badge: "bg-blue-50 text-blue-600 ring-blue-200" },
  good: { icon: "check", badge: "bg-brand-50 text-brand-600 ring-brand-200" },
  warn: { icon: "phone", badge: "bg-amber-50 text-amber-700 ring-amber-200" },
  money: { icon: "dollar", badge: "bg-brand-50 text-brand-600 ring-brand-200" },
  refund: { icon: "dollar", badge: "bg-violet-50 text-violet-600 ring-violet-200" },
  quiet: { icon: "clock", badge: "bg-gray-50 text-gray-500 ring-gray-200" },
} satisfies Record<string, { icon: IconName; badge: string }>;

type Alert = { key: string; jobId: string; tone: keyof typeof TONES; title: string; body: string };
type Toast = Alert & { id: number; leaving: boolean };

const jobHref = (id: string) => `/dashboard?job=${id}`;
const who = (j: AlertJob) => j.customer_name ?? "A caller";
const place = (j: AlertJob) => [j.service_address, j.zip && !j.service_address?.includes(j.zip) ? j.zip : null].filter(Boolean).join(" ");
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");
const card = (last4: string | null) => (last4 ? `Card •••• ${last4}` : "A card");

/**
 * Every alert-worthy moment a job has reached, each with a stable key. The notifier shows a key
 * the first time it appears, so a moment never repeats and polling can't double it.
 */
function alertsFor(j: AlertJob): Alert[] {
  const out: Alert[] = [];
  const add = (id: string, tone: Alert["tone"], title: string, body: string) => out.push({ key: `${j.id}:${id}`, jobId: j.id, tone, title, body });

  // A new call, as soon as Ava has a name or the problem.
  if (j.customer_name || j.issue) {
    const emergency = j.urgency === "emergency";
    add(
      "new",
      emergency ? "urgent" : "call",
      `New ${emergency ? "emergency" : "call"} · ${who(j)}${j.status === "out_of_area" ? " (outside your area)" : ""}`,
      join(j.issue, place(j)) || "Ava is on the call.",
    );
  }

  // The visit is secured: a PayPal hold, or a card or PayPal account saved on file.
  if (j.held) {
    const method = j.hold_method === "keypad" ? `${card(j.card_last4)} on the phone keypad` : j.card_last4 ? `${card(j.card_last4)} through PayPal` : "PayPal";
    add("secured", "secured", `${dollars(j.fee_cents)} hold placed · ${who(j)}`, `${method}. Nothing charged yet.`);
  } else if (j.secure_with === "card" && j.vault_type) {
    const method = j.vault_type === "venmo" ? "Venmo" : j.vault_type === "paypal" ? "PayPal" : card(j.card_last4);
    add("secured", "secured", `Card on file · ${who(j)}`, `${method} saved with PayPal. $0 charged.`);
  }

  if (j.status === "dispatched") {
    add("dispatched", "dispatched", `${j.tech_name ?? "Technician"} dispatched · ${who(j)}`, join(j.eta && `Arriving in ${j.eta}`, place(j)) || "On the way.");
  }

  // The technician's answer when Ava phoned them. Without a yes, the visit stays secured and the
  // caller needs a call back (nobody needs one if the job was cancelled meanwhile).
  const tech = j.tech_name ?? "Technician";
  const at = j.tech_ms ?? 0;
  if (j.tech_status === "accepted") {
    add(`tech:accepted:${at}`, "good", `${tech} accepted · ${who(j)}`, join(j.eta && `On the way, arriving in ${j.eta}`, place(j)) || "On the way.");
  }
  const stillSecured = j.status === "hold_placed" || j.status === "card_saved" || j.status === "dispatched";
  if (stillSecured && (j.tech_status === "declined" || j.tech_status === "no_answer" || j.tech_status === "failed")) {
    const what = j.tech_status === "declined" ? `${tech} can't take it` : j.tech_status === "no_answer" ? `${tech} didn't answer` : `Couldn't reach ${j.tech_name ?? "the technician"}`;
    add(
      `tech:${j.tech_status}:${at}`,
      "warn",
      `${what} · ${who(j)} needs a technician`,
      `Call ${who(j)} back${j.callback_phone ? ` at ${formatPhone(j.callback_phone)}` : ""}. ${j.held ? "PayPal hold" : "Card on file"}, nothing charged.`,
    );
  }

  // The customer approved the final bill on their own phone.
  if (j.approved) {
    add("approved", "good", `Bill approved · ${who(j)}`, j.approval_cents ? `${dollars(j.approval_cents)}, approved by the customer.` : "The customer approved the final bill.");
  }

  // Money in.
  if (j.status === "completed") {
    const released = j.fee_cents - j.captured_cents;
    add("paid", "money", `${dollars(j.captured_cents)} collected · ${who(j)}`, released > 0 ? `Charged from the hold. ${dollars(released)} released.` : "Charged from the hold.");
  }
  if (j.status === "paid") {
    add(
      "paid",
      "money",
      `Paid in full · ${who(j)}`,
      j.balance_cents ? `${dollars(j.balance_cents)} balance paid. ${dollars(j.captured_cents)} collected in all.` : `${dollars(j.captured_cents)} charged to the card on file.`,
    );
  }
  if (j.refunded_cents > 0) {
    add(
      `refund:${j.refunded_cents}`,
      "refund",
      `${dollars(j.refunded_cents)} refunded · ${who(j)}`,
      j.status === "refunded" ? "Everything collected went back to the customer." : "Part of the payment went back to the customer.",
    );
  }

  if (j.status === "scheduled") {
    add("booked", "quiet", `Booked ${j.eta ?? "for the morning"} · ${who(j)}`, join(j.issue, j.callback_phone && formatPhone(j.callback_phone)) || "No hold. First morning slot.");
  }
  if (j.status === "cancelled_fee") {
    add(
      "cancelled",
      "quiet",
      `Cancelled after dispatch · ${who(j)}`,
      j.held ? `${dollars(j.captured_cents)} trip fee kept, the rest of the hold released.` : `${dollars(j.captured_cents)} trip fee charged to the card on file.`,
    );
  }
  if (j.status === "released") {
    add("cancelled", "quiet", j.held ? `Hold released · ${who(j)}` : j.vault_type ? `Card removed · ${who(j)}` : `Cancelled · ${who(j)}`, "Nothing was charged.");
  }

  // Hung up before anything was secured: worth a call back.
  if (j.status === "ended" && (j.customer_name || j.issue || j.callback_phone)) {
    add(
      "ended",
      "warn",
      `Call back · ${j.customer_name ?? "a caller"}`,
      join(j.issue, j.callback_phone && `Callback ${formatPhone(j.callback_phone)}`, "Hung up before the visit was secured."),
    );
  }
  return out;
}

/** Two soft bell notes, made on the fly: no audio files. */
function chime(ctx: AudioContext) {
  const start = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = 0.16;
  out.connect(ctx.destination);
  for (const [freq, delay] of [
    [880, 0],
    [1318.5, 0.14],
  ] as const) {
    for (const [mult, level] of [
      [1, 1],
      [2, 0.22],
    ] as const) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      env.gain.setValueAtTime(0.0001, start + delay);
      env.gain.exponentialRampToValueAtTime(level, start + delay + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, start + delay + (mult === 1 ? 0.6 : 0.3));
      osc.connect(env).connect(out);
      osc.start(start + delay);
      osc.stop(start + delay + 0.65);
    }
  }
}

/** A hidden tab gets system notifications, unless push already brings them to this device. */
async function notifySystem(alerts: Alert[]): Promise<boolean> {
  if (document.visibilityState !== "hidden" || !("Notification" in window) || Notification.permission !== "granted") return false;
  if (await currentSubscription().catch(() => null)) return false;
  const reg = await navigator.serviceWorker?.getRegistration("/").catch(() => undefined);
  // One per job, newest moment wins, with the same tag push uses.
  const latest = new Map(alerts.map((a) => [a.jobId, a]));
  for (const a of latest.values()) {
    const url = new URL(jobHref(a.jobId), window.location.origin).href;
    const options = { body: a.body, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: `job-${a.jobId}`, renotify: true, data: { url } } as NotificationOptions;
    if (reg) {
      await reg.showNotification(a.title, options).catch(() => {});
    } else {
      const n = new Notification(a.title, options);
      n.onclick = () => {
        window.focus();
        window.location.assign(url);
      };
    }
  }
  return true;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

function offerDismissed(): boolean {
  try {
    return window.localStorage.getItem(OFFER_KEY) === "later";
  } catch {
    return false;
  }
}

type Offer = { publicKey: string; step: "ask" | "busy" | "on" | "error"; error?: string };

export function Notifier() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "hidden", () => false);
  const [offer, setOffer] = useState<Offer | null>(null);
  // What screen readers hear: the new alerts' text, without the buttons around it.
  const [announcement, setAnnouncement] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const nextId = useRef(1);
  const list = useRef<HTMLOListElement>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((all) => all.filter((t) => t.id !== id));
      // A removed element never fires blur, so recheck where focus is.
      setFocused(Boolean(list.current?.contains(document.activeElement)));
    }, 200);
  }, []);

  // Sound is only allowed after the owner touches the page; keep the audio unlocked from then on.
  useEffect(() => {
    const unlock = () => {
      const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      audio.current ??= new AudioCtx();
      if (audio.current.state === "suspended") void audio.current.resume().catch(() => {});
    };
    const events = ["pointerdown", "keydown", "touchend"] as const;
    for (const e of events) window.addEventListener(e, unlock, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, unlock);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let since: number | null = null;
    let openedAt = 0;
    let busy = false;
    const fired = new Set<string>();
    const seen = new Set<string>();

    const announce = async (fresh: Alert[]) => {
      if (quietPage(window.location.pathname)) return;
      const added = fresh.map((a): Toast => ({ ...a, id: nextId.current++, leaving: false }));
      setToasts((all) => [...all, ...added].slice(-MAX_TOASTS));
      setAnnouncement(fresh.map((a) => `${a.title}. ${a.body}`).join(" "));
      const shownBySystem = await notifySystem(fresh).catch(() => false);
      if (!shownBySystem && audio.current?.state === "running") chime(audio.current);
    };

    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(since === null ? "/api/push/feed" : `/api/push/feed?since=${since}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const feed = (await res.json()) as AlertFeed;
        const first = since === null;
        if (first) openedAt = feed.now;
        const fresh: Alert[] = [];
        for (const job of feed.jobs) {
          // The first look sets what's already known. A job from before the page opened that we
          // haven't seen yet has no history here either: learn it quietly.
          const quiet = first || (!seen.has(job.id) && job.created_ms < openedAt - 10_000);
          seen.add(job.id);
          for (const alert of alertsFor(job)) {
            if (fired.has(alert.key)) continue;
            fired.add(alert.key);
            if (!quiet) fresh.push(alert);
          }
        }
        since = feed.now;
        if (fresh.length && !stopped) void announce(fresh);
      } catch {
        // Offline or a deploy in progress: the next check catches up.
      } finally {
        busy = false;
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(() => void tick(), document.visibilityState === "visible" ? POLL_MS : POLL_HIDDEN_MS);
    };
    const tick = async () => {
      await poll();
      schedule();
    };
    const checkNow = () => {
      clearTimeout(timer);
      void tick();
    };

    // Back in the app: the owner has seen it, so clear the Home Screen badge and old notifications.
    const clearSeen = async () => {
      if (document.visibilityState !== "visible") return;
      void navigator.clearAppBadge?.().catch(() => {});
      const reg = await navigator.serviceWorker?.getRegistration("/").catch(() => undefined);
      for (const n of (await reg?.getNotifications().catch(() => [])) ?? []) n.close();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      checkNow();
      void clearSeen();
    };
    const onWorkerMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; url?: unknown } | null;
      // A push just arrived: look now instead of at the next check.
      if (data?.type === "alert") checkNow();
      // A tapped notification wants this window on the job.
      if (data?.type === "open" && typeof data.url === "string") {
        const url = new URL(data.url, window.location.origin);
        if (url.origin === window.location.origin) window.location.assign(url.href);
      }
    };

    void tick();
    void clearSeen();
    document.addEventListener("visibilitychange", onVisibility);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);

    // Start the service worker, keep this device's push subscription filed under the workspace
    // it's showing, and in the installed app offer alerts once.
    void (async () => {
      if (!(await registerWorker()) || stopped) return;
      await syncSubscription().catch(() => null);
      if (stopped || !isStandalone() || !pushSupported() || Notification.permission !== "default" || offerDismissed()) return;
      const res = await fetch("/api/push/key", { cache: "no-store" }).catch(() => null);
      const { publicKey } = ((await res?.json().catch(() => null)) ?? {}) as { publicKey?: string | null };
      if (publicKey && !stopped) setOffer({ publicKey, step: "ask" });
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, []);

  const acceptOffer = async () => {
    if (!offer) return;
    setOffer({ ...offer, step: "busy" });
    try {
      const { permission } = await turnOnAlerts(offer.publicKey);
      if (permission !== "granted") {
        setOffer(null); // they said no; Go live explains how to change it
        return;
      }
      setOffer({ ...offer, step: "on" });
      setTimeout(() => setOffer(null), 4000);
    } catch (e) {
      setOffer({ ...offer, step: "error", error: e instanceof Error ? e.message : "Couldn't turn on alerts. Try again from Go live." });
    }
  };
  const declineOffer = () => {
    try {
      window.localStorage.setItem(OFFER_KEY, "later");
    } catch {
      // Private mode: it just asks again next time.
    }
    setOffer(null);
  };

  const paused = hovered || focused || hidden;

  return (
    <section
      aria-label="Live alerts"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96 sm:px-0 sm:pb-0"
    >
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <ol
        ref={list}
        className="flex w-full max-w-sm flex-col gap-2 sm:max-w-none"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} paused={paused} onDismiss={dismiss} />
        ))}
      </ol>

      {offer && (
        // The offer only exists in the browser, but reading the URL still belongs inside Suspense.
        <Suspense fallback={null}>
          <OfferCard offer={offer} onAccept={() => void acceptOffer()} onDecline={declineOffer} />
        </Suspense>
      )}
    </section>
  );
}

/** In the installed app: one tap to turn on alerts. Go live has the full setup, so it stays off there (and off the test call). */
function OfferCard({ offer, onAccept, onDecline }: { offer: Offer; onAccept: () => void; onDecline: () => void }) {
  const pathname = usePathname();
  if (pathname === "/go-live" || quietPage(pathname)) return null;
  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-gray-200 bg-white p-4 shadow-lg ring-1 ring-black/5 sm:max-w-none">
      {offer.step === "on" ? (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Icon name="check" className="h-4 w-4 text-brand-600" /> Alerts are on for this phone.
        </p>
      ) : (
        <>
          <div className="flex gap-3">
            <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1", TONES.secured.badge)}>
              <Icon name="shield" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Turn on alerts for this phone?</p>
              <p className="mt-0.5 text-sm text-gray-600">Know the moment Ava secures a job, even with the app closed.</p>
              {offer.step === "error" && (
                <p role="alert" className="mt-1.5 text-sm text-red-700">
                  {offer.error}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDecline}>
              Not now
            </Button>
            <Button type="button" onClick={onAccept} disabled={offer.step === "busy"}>
              {offer.step === "busy" ? "Turning on…" : "Turn on alerts"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ToastCard({ toast, paused, onDismiss }: { toast: Toast; paused: boolean; onDismiss: (id: number) => void }) {
  const remaining = useRef(TOAST_MS);
  const tone = TONES[toast.tone];

  // Counts down only while the owner isn't reading (hover, focus) and the page is on screen.
  useEffect(() => {
    if (paused || toast.leaving) return;
    const started = Date.now();
    const t = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(2000, remaining.current - (Date.now() - started));
    };
  }, [paused, toast.id, toast.leaving, onDismiss]);

  return (
    <li
      className={cx(
        "pointer-events-auto relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 transition duration-200 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none",
        toast.leaving && "translate-y-1 opacity-0",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDismiss(toast.id);
      }}
    >
      {/* A full page load, so the job opens even when the dashboard is already on screen. */}
      <a href={jobHref(toast.jobId)} className="flex gap-3 p-4 pr-11 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1", tone.badge)}>
          <Icon name={tone.icon} className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{toast.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-sm text-gray-600">{toast.body}</span>
          <span className="mt-1.5 block text-xs font-semibold text-brand-700">Open job</span>
        </span>
      </a>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss: ${toast.title}`}
        className="absolute right-2 top-2 rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}
