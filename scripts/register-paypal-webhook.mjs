#!/usr/bin/env node
/**
 * Point the PayPal sandbox app's webhook at a deployment (created, or updated in place if that URL
 * is already registered) and print the webhook id the app verifies every event against.
 *
 *   node --env-file=.env.local scripts/register-paypal-webhook.mjs https://your-app.vercel.app
 *
 * Nothing else to set: the app finds the webhook registered for its own URL. PAYPAL_WEBHOOK_ID
 * (printed below) only overrides that lookup.
 * Docs: https://developer.paypal.com/docs/api/webhooks/v1/
 */
const base = process.argv[2]?.replace(/\/+$/, "").replace(/\/api\/paypal\/webhook$/, "");
if (!base?.startsWith("https://")) {
  console.error("Usage: node --env-file=.env.local scripts/register-paypal-webhook.mjs https://your-app.example.com");
  process.exit(1);
}
const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: secret } = process.env;
if (!clientId || !secret) {
  console.error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are missing. Pass --env-file=.env.local.");
  process.exit(1);
}

const API = "https://api-m.sandbox.paypal.com";
const url = `${base}/api/paypal/webhook`;
// The events src/lib/paypal-webhooks.ts handles (its HANDLERS).
const EVENT_TYPES = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "PAYMENT.CAPTURE.DENIED",
  "VAULT.PAYMENT-TOKEN.CREATED",
  "VAULT.PAYMENT-TOKEN.DELETED",
];

async function paypal(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json.details?.map((d) => `${d.issue ?? ""} ${d.description ?? ""}`.trim()).join("; ");
    throw new Error(`${method} ${path} → ${res.status} ${json.name ?? json.error ?? ""}: ${detail || json.message || json.error_description || text}`);
  }
  return json;
}

try {
  const { access_token: token } = await paypal("POST", "/v1/oauth2/token", "grant_type=client_credentials");
  const { webhooks = [] } = await paypal("GET", "/v1/notifications/webhooks", undefined, token);
  const event_types = EVENT_TYPES.map((name) => ({ name }));
  const existing = webhooks.find((w) => w.url === url);
  let id;
  if (existing) {
    await paypal("PATCH", `/v1/notifications/webhooks/${existing.id}`, [{ op: "replace", path: "/event_types", value: event_types }], token);
    id = existing.id;
    console.log(`Updated webhook ${id} → ${url}`);
  } else {
    ({ id } = await paypal("POST", "/v1/notifications/webhooks", { url, event_types }, token));
    console.log(`Created webhook ${id} → ${url}`);
  }
  console.log(`Events: ${EVENT_TYPES.join(", ")}`);
  const others = webhooks.filter((w) => w.url !== url);
  if (others.length) console.log(`Other webhooks on this PayPal app: ${others.map((w) => `${w.id} → ${w.url}`).join(", ")}`);
  console.log("The app finds this webhook by its URL. To pin it instead, set:");
  console.log(`PAYPAL_WEBHOOK_ID=${id}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
