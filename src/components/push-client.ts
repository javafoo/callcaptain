import type { AlertDevice } from "@/lib/push";

/**
 * Alerts on this device, in the browser: the service worker (public/sw.js), notification
 * permission and the Web Push subscription the server sends alerts to. Used by the Go live card
 * and the app's live alerts.
 */

export type AlertsState = "checking" | "unsupported" | "install" | "blocked" | "off" | "on";

export function isIOS(): boolean {
  // iPadOS reports itself as a Mac; touch gives it away.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/** Opened from the Home Screen (or as an installed desktop app), not in a browser tab. */
export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The worker that shows alerts and opens jobs. Registering again is harmless. */
export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function readAlertsState(): Promise<{ state: AlertsState; endpoint: string | null }> {
  // iPhone and iPad only offer push to apps added to the Home Screen.
  if (!pushSupported()) return { state: isIOS() && !isStandalone() ? "install" : "unsupported", endpoint: null };
  if (Notification.permission === "denied") return { state: "blocked", endpoint: null };
  const sub = Notification.permission === "granted" ? await currentSubscription() : null;
  return sub ? { state: "on", endpoint: sub.endpoint } : { state: "off", endpoint: null };
}

async function save(method: "POST" | "DELETE", body: unknown): Promise<AlertDevice[]> {
  const res = await fetch("/api/push/subscribe", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { devices?: AlertDevice[]; error?: string };
  if (!res.ok) throw new Error(out.error ?? "Couldn't save that. Check your connection and try again.");
  return out.devices ?? [];
}

/** Re-save this device's subscription under the workspace it's showing now (it may have switched). */
export async function syncSubscription(): Promise<AlertDevice[] | null> {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  const sub = await currentSubscription();
  return sub ? save("POST", sub.toJSON()) : null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob((base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) => a !== null && a.byteLength === b.length && new Uint8Array(a).every((v, i) => v === b[i]);

/**
 * Turn on alerts for this device. Call it straight from a tap: iPhone only shows the permission
 * prompt for a direct user action. Returns the permission, this device's endpoint and the
 * workspace's devices.
 */
export async function turnOnAlerts(publicKey: string): Promise<{ permission: NotificationPermission; endpoint: string | null; devices: AlertDevice[] }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { permission, endpoint: null, devices: [] };
  if (!(await registerWorker())) throw new Error("This browser couldn't start alerts. Reload the page and try again.");
  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Subscribed with an older server key: it would never receive anything, so start over.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return { permission, endpoint: sub.endpoint, devices: await save("POST", sub.toJSON()) };
}

export async function turnOffAlerts(): Promise<AlertDevice[]> {
  const sub = await currentSubscription();
  if (!sub) return [];
  const { endpoint } = sub;
  await sub.unsubscribe().catch(() => false);
  return save("DELETE", { endpoint });
}

/** Same id the server gives this device in its device list (a hash of the endpoint). */
export async function deviceIdOf(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
