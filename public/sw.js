/*
 * Call Captain service worker: shows the owner's alerts (Web Push) and opens the job when one is
 * tapped. It has no fetch handler, so pages always load straight from the network.
 */

const ICON = "/icons/icon-192.png";
const BADGE = "/icons/badge-96.png";
/** Owner pages a tapped alert may take over. Never the test call page: that would hang up a live call. */
const APP_PAGES = ["/dashboard", "/payments", "/setup", "/go-live"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const sameOriginPath = (value, fallback) => {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : fallback;
  } catch {
    return fallback;
  }
};

async function windows() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

async function updateBadge() {
  if (!self.navigator.setAppBadge) return;
  const open = await self.registration.getNotifications();
  await (open.length ? self.navigator.setAppBadge(open.length) : self.navigator.clearAppBadge()).catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Call Captain";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : "call-captain";
  const url = sameOriginPath(data.url, "/dashboard");

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: typeof data.body === "string" ? data.body : "",
        icon: ICON,
        badge: BADGE,
        tag,
        renotify: true,
        timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
        data: { url },
      });
      await updateBadge();
      // Open app pages refresh their jobs right away instead of waiting for their next check.
      for (const client of await windows()) client.postMessage({ type: "alert", tag });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(sameOriginPath(event.notification.data && event.notification.data.url, "/dashboard"), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const all = await windows();
      const isApp = (client, prefix) => {
        const { origin, pathname } = new URL(client.url);
        return origin === self.location.origin && APP_PAGES.some((p) => (prefix ? p === prefix : true) && (pathname === p || pathname.startsWith(`${p}/`)));
      };
      const app = all.find((c) => isApp(c, "/dashboard")) || all.find((c) => isApp(c));
      if (app) {
        const focused = await app.focus().catch(() => app);
        try {
          if (focused.navigate) {
            await focused.navigate(url);
            return;
          }
        } catch {
          // Not controlled by this worker yet: ask the page to go there itself.
        }
        focused.postMessage({ type: "open", url });
        return;
      }
      await self.clients.openWindow(url);
    })().then(updateBadge),
  );
});

self.addEventListener("notificationclose", (event) => event.waitUntil(updateBadge()));

/* The browser rotated this device's push subscription: save the new one, so alerts keep coming. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = old && old.options ? old.options.applicationServerKey : null;
      const sub = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (!sub) return;
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), replaces: old ? old.endpoint : null }),
      });
    })().catch(() => {}),
  );
});
