#!/usr/bin/env node
/**
 * One-time setup: create the SignalWire "SWML webhook" resource that runs our agent, and
 * print the Fabric address the browser dials.
 *
 *   node --env-file=.env.local scripts/provision-signalwire.mjs https://your-app.vercel.app
 *
 * Then set SIGNALWIRE_WEB_ADDRESS_ID and SIGNALWIRE_WEB_ADDRESS from the output.
 * Docs: https://signalwire.com/docs/apis/rest/swml-webhook/create-swml-webhook
 *       https://signalwire.com/docs/apis/rest/swml-webhook/list-swml-webhook-addresses
 */
const base = process.argv[2]?.replace(/\/$/, "");
if (!base?.startsWith("https://")) {
  console.error("Usage: node --env-file=.env.local scripts/provision-signalwire.mjs https://your-app.example.com");
  process.exit(1);
}
const space = process.env.SIGNALWIRE_SPACE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
const auth = "Basic " + Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString("base64");
const url = `${base}/api/swml?key=${encodeURIComponent(process.env.WEBHOOK_SECRET)}`;

async function sw(method, path, body) {
  const res = await fetch(`https://${space}${path}`, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const existingId = process.env.SIGNALWIRE_RESOURCE_ID;
let id = existingId;
if (id) {
  await sw("PATCH", `/api/fabric/resources/swml_webhooks/${id}`, { primary_request_url: url });
  console.log("Updated resource", id);
} else {
  const res = await sw("POST", "/api/fabric/resources/swml_webhooks", {
    name: "Call Captain (hackathon)",
    used_for: "calling",
    primary_request_url: url,
    primary_request_method: "POST",
  });
  id = res.id;
  console.log("Created resource", id);
}
const { data } = await sw("GET", `/api/fabric/resources/swml_webhooks/${id}/addresses`);
const addr = data.find((a) => a.channels?.audio) ?? data[0];
console.log(`SIGNALWIRE_RESOURCE_ID=${id}`);
console.log(`SIGNALWIRE_WEB_ADDRESS_ID=${addr.id}`);
console.log(`SIGNALWIRE_WEB_ADDRESS=${addr.channels.audio}`);
