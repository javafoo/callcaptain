"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AlertDevice } from "@/lib/push";
import { deviceIdOf, isAndroid, isIOS, isStandalone, readAlertsState, syncSubscription, turnOffAlerts, turnOnAlerts, type AlertsState } from "./push-client";
import { Button, Card, CardHeader, Icon, cx } from "./ui";

/**
 * Go live → "Get alerts on your phone": alerts on this device (on, off, blocked, or what to do),
 * a test alert to every device, and a code that opens this workspace on the owner's phone.
 */

type Platform = "ios" | "ios-app" | "android" | "desktop";
type Note = { tone: "ok" | "error"; text: string } | null;

const STATUS: Record<AlertsState, { label: string; pill: string; dot: string }> = {
  checking: { label: "Checking", pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-300" },
  on: { label: "On", pill: "bg-brand-50 text-brand-700 ring-brand-200", dot: "bg-brand-500" },
  off: { label: "Off", pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400" },
  blocked: { label: "Blocked", pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  install: { label: "Install the app first", pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  unsupported: { label: "Not available here", pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-300" },
};

function explain(state: AlertsState, platform: Platform, ready: boolean): string {
  if (!ready && (state === "off" || state === "on")) return "Alerts aren't set up on this server yet.";
  switch (state) {
    case "checking":
      return "Checking this device…";
    case "on":
      return "This device gets an alert for every new emergency, secured visit, dispatch and payment, even with Call Captain closed.";
    case "off":
      return "Turn on alerts and this device buzzes the moment Ava secures a job, even with Call Captain closed.";
    case "blocked":
      return platform === "ios-app"
        ? "Notifications are off for Call Captain. Open Settings, then Notifications, then Call Captain, and allow notifications."
        : platform === "android"
          ? "Notifications are blocked. Open your phone's Settings, then Apps, then Call Captain (or Chrome), and allow notifications. Then come back here."
          : "Notifications are blocked for this site. Click the icon next to the address bar, allow notifications, then reload this page.";
    case "install":
      return "iPhone only allows alerts in the installed app. Tap Share, then Add to Home Screen. Open Call Captain from your Home Screen and turn on alerts there.";
    case "unsupported":
      return platform === "ios-app"
        ? "Update this iPhone to iOS 16.4 or later to get alerts."
        : "This browser can't show alerts. Use Chrome, Edge, Firefox or Safari, or set up your phone with the code.";
  }
}

const since = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
const noSubscribe = () => () => {};

export function PhoneAlerts({
  workspace,
  demo,
  publicKey,
  initialDevices,
}: {
  workspace: string | null;
  demo: boolean;
  publicKey: string | null;
  initialDevices: AlertDevice[];
}) {
  const [state, setState] = useState<AlertsState>("checking");
  const [devices, setDevices] = useState(initialDevices);
  const [thisDevice, setThisDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => null);
  const platform = useSyncExternalStore<Platform>(
    noSubscribe,
    () => (isIOS() ? (isStandalone() ? "ios-app" : "ios") : isAndroid() ? "android" : "desktop"),
    () => "desktop",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await readAlertsState();
      if (cancelled) return;
      setState(found.state);
      if (!found.endpoint) return;
      setThisDevice(await deviceIdOf(found.endpoint));
      // Make sure the server files this device under the workspace on screen.
      const synced = await syncSubscription().catch(() => null);
      if (synced && !cancelled) setDevices(synced);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy("on");
    setNote(null);
    try {
      const result = await turnOnAlerts(publicKey);
      if (result.permission === "denied") {
        setState("blocked");
      } else if (result.permission !== "granted") {
        setNote({ tone: "error", text: "Alerts stay off until you allow notifications. Tap Turn on alerts to try again." });
      } else {
        setState("on");
        setDevices(result.devices);
        if (result.endpoint) setThisDevice(await deviceIdOf(result.endpoint));
        setNote({ tone: "ok", text: "Alerts are on. Send a test to see one." });
      }
    } catch (e) {
      setNote({ tone: "error", text: message(e) });
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    setBusy("off");
    setNote(null);
    try {
      setDevices(await turnOffAlerts());
      setState("off");
      setThisDevice(null);
      setNote({ tone: "ok", text: "Alerts are off on this device." });
    } catch (e) {
      setNote({ tone: "error", text: message(e) });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    setNote(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const out = (await res.json().catch(() => ({}))) as { sent?: number; removed?: number; devices?: AlertDevice[]; error?: string };
      if (out.devices) setDevices(out.devices);
      if (!res.ok) throw new Error(out.error ?? "Couldn't send the test. Try again.");
      const sent = out.sent ?? 0;
      const removed = out.removed ? ` Removed ${out.removed === 1 ? "a device" : `${out.removed} devices`} that no longer accepts alerts.` : "";
      setNote(
        sent
          ? { tone: "ok", text: `Test sent to ${sent === 1 ? "1 device" : `${sent} devices`}. It should arrive in a few seconds.${removed}` }
          : { tone: "error", text: out.removed ? `None of your devices accept alerts anymore. Turn alerts on again.` : "The push service didn't take it. Try again in a minute." },
      );
    } catch (e) {
      setNote({ tone: "error", text: message(e) });
    } finally {
      setBusy(null);
    }
  };

  const ready = Boolean(publicKey);
  const status = STATUS[state];
  const link = origin && workspace && !demo ? `${origin}/dashboard?workspace=${workspace}` : null;

  return (
    <Card>
      <CardHeader title="Get alerts on your phone" subtitle="New emergencies, secured visits, dispatches and payments, the moment they happen." />
      <div className="grid gap-6 p-5 md:grid-cols-2 md:gap-0 md:divide-x md:divide-gray-100">
        {/* This device */}
        <section aria-labelledby="alerts-device" className="flex flex-col gap-4 md:pr-6">
          <div className="flex items-center justify-between gap-3">
            <h3 id="alerts-device" className="text-sm font-semibold text-gray-900">
              This device
            </h3>
            <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", status.pill)}>
              <span className={cx("h-1.5 w-1.5 rounded-full", status.dot)} />
              {status.label}
            </span>
          </div>
          <p className="text-sm text-gray-600">{explain(state, platform, ready)}</p>

          <div className="flex flex-wrap gap-2">
            {state === "off" && (
              <Button type="button" onClick={() => void turnOn()} disabled={!ready || busy !== null}>
                <Icon name="shield" className="h-4 w-4" />
                {busy === "on" ? "Turning on…" : "Turn on alerts"}
              </Button>
            )}
            {devices.length > 0 && (
              <Button type="button" variant={state === "on" ? "primary" : "secondary"} onClick={() => void sendTest()} disabled={!ready || busy !== null}>
                {busy === "test" ? "Sending…" : "Send a test alert"}
              </Button>
            )}
            {state === "on" && (
              <Button type="button" variant="ghost" onClick={() => void turnOff()} disabled={busy !== null}>
                {busy === "off" ? "Turning off…" : "Turn off"}
              </Button>
            )}
          </div>

          <p role="status" className={cx("min-h-5 text-sm", note?.tone === "error" ? "text-red-700" : "text-brand-700")}>
            {note?.text}
          </p>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Alerts go to</p>
            {devices.length ? (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Icon name={/iPhone|iPad|Android/.test(d.label) ? "phone" : "globe"} className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{d.label}</span>
                    {d.id === thisDevice ? (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">This device</span>
                    ) : (
                      <span className="text-xs text-gray-500">since {since(d.since)}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-gray-500">No devices yet. Turn on alerts here, or on your phone.</p>
            )}
          </div>
        </section>

        {/* Open on your phone */}
        <section aria-labelledby="alerts-phone" className="flex flex-col gap-4 border-t border-gray-100 pt-6 md:border-t-0 md:pl-6 md:pt-0">
          <h3 id="alerts-phone" className="text-sm font-semibold text-gray-900">
            Open on your phone
          </h3>
          {demo ? (
            <p className="text-sm text-gray-600">This is the public demo line. To get its alerts on a phone, open your admin link there.</p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="flex h-[148px] w-[148px] items-center justify-center rounded-xl border border-gray-200 bg-white p-2">
                  {link ? (
                    <QRCodeSVG
                      value={link}
                      size={130}
                      level="Q"
                      marginSize={0}
                      fgColor="#0d1f33"
                      title="Code that opens Call Captain on your phone"
                      imageSettings={{ src: "/icons/icon-192.png", height: 26, width: 26, excavate: true }}
                    />
                  ) : (
                    <div className="h-[130px] w-[130px] animate-pulse rounded-lg bg-gray-100" />
                  )}
                </div>
                <button
                  type="button"
                  disabled={!link}
                  onClick={() => {
                    if (!link) return;
                    void navigator.clipboard.writeText(link).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-600 disabled:opacity-50"
                >
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
              <div className="flex flex-col gap-3 text-sm text-gray-600">
                <div>
                  <p className="font-medium text-gray-900">iPhone</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                    <li>Scan the code with the Camera and open the link in Safari.</li>
                    <li>Tap Share, then Add to Home Screen.</li>
                    <li>Open Call Captain from your Home Screen and turn on alerts.</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Android</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                    <li>Scan the code and open the link in Chrome.</li>
                    <li>Tap Install app (or ⋮, then Add to Home screen).</li>
                    <li>Open Call Captain and turn on alerts.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
          {!demo && <p className="text-xs text-gray-500">The link opens this workspace with no sign-in. Share it only with your own team.</p>}
        </section>
      </div>
    </Card>
  );
}
