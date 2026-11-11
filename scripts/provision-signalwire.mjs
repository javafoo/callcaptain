#!/usr/bin/env node
/**
 * One-time setup: create the SignalWire "SWML webhook" resource that runs our agent, and
 * print the Fabric address the browser dials.
 *
 *   node --env-file=.env.local scripts/provision-signalwire.mjs https://your-app.vercel.app
 *   node --env-file=.env.local scripts/provision-signalwire.mjs https://your-app.vercel.app --phone +14085550123
 *
 * Then set SIGNALWIRE_WEB_ADDRESS_ID and SIGNALWIRE_WEB_ADDRESS from the output.
 *
 * --phone routes that number's voice calls to the same resource (it must be a number in this
 * SignalWire project). Only its calling channel changes; its messaging settings stay as they
 * are. Set CALL_CAPTAIN_PHONE to the same number: the agent answers it and phones technicians from it.
 *
 * Docs: https://signalwire.com/docs/apis/rest/swml-webhook/create-swml-webhook
 *       https://signalwire.com/docs/apis/rest/swml-webhook/list-swml-webhook-addresses
 *       https://signalwire.com/docs/apis/rest/phone-numbers/list-phone-numbers
 *       https://signalwire.com/docs/apis/rest/phone-number-addresses/list-phone-number-addresses
 *       https://signalwire.com/docs/apis/rest/phone-number-addresses/create-phone-number-address
 *       https://signalwire.com/docs/apis/rest/phone-number-addresses/update-phone-number-address
 *       https://signalwire.com/docs/apis/rest/phone-numbers/update-phone-number
 */
const usage = "Usage: node --env-file=.env.local scripts/provision-signalwire.mjs https://your-app.example.com [--phone +1XXXXXXXXXX]";
let base;
let phoneArg;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--phone") phoneArg = args[++i] ?? "";
  else if (args[i].startsWith("--phone=")) phoneArg = args[i].slice("--phone=".length);
  else base ??= args[i].replace(/\/$/, "");
}
if (!base?.startsWith("https://")) {
  console.error(usage);
  process.exit(1);
}

/** US numbers only, as E.164. */
function toE164(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}
const phone = phoneArg === undefined ? null : toE164(phoneArg);
if (phoneArg !== undefined && !phone) {
  console.error(`--phone needs a US number like +14085550123.\n${usage}`);
  process.exit(1);
}

const space = process.env.SIGNALWIRE_SPACE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
const auth = "Basic " + Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString("base64");
const url = `${base}/api/swml?key=${encodeURIComponent(process.env.WEBHOOK_SECRET)}`;

async function sw(method, path, body) {
  const res = await fetch(path.startsWith("https://") ? path : `https://${space}${path}`, {
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

if (phone) {
  await routePhone(phone, id).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

console.log(`SIGNALWIRE_RESOURCE_ID=${id}`);
console.log(`SIGNALWIRE_WEB_ADDRESS_ID=${addr.id}`);
console.log(`SIGNALWIRE_WEB_ADDRESS=${addr.channels.audio}`);
if (phone) console.log(`CALL_CAPTAIN_PHONE=${phone}`);

/**
 * Point the number's calling channel at our resource. Each phone number has one Fabric address per
 * channel (calling, messaging); we only ever touch the calling one, so messaging is left alone.
 */
async function routePhone(number, resourceId) {
  const found = await sw("GET", `/api/relay/rest/phone_numbers?filter_number=${encodeURIComponent(number)}`);
  const pn = (found.data ?? []).find((n) => n.number === number);
  if (!pn) throw new Error(`${number} isn't a phone number in this SignalWire project.`);
  const messagingBefore = messagingOf(pn);

  if (pn.calling_handler_resource_id === resourceId) {
    console.log(`${number} already sends its calls to the agent.`);
    return;
  }

  try {
    const calling = await findCallingAddress(pn.id);
    if (calling?.resource_id) {
      await sw("PATCH", `/api/fabric/phone_number_addresses/${calling.id}`, { resource_id: resourceId });
    } else {
      await sw("POST", "/api/fabric/phone_number_addresses", { resource_id: resourceId, handler_type: "calling", phone_number_id: pn.id });
    }
  } catch (e) {
    // Older numbers that aren't on Fabric addresses yet: the phone number's own call handler,
    // pointed at the same SWML URL (calling fields only).
    console.warn(`Linking through Fabric addresses didn't work (${e.message.slice(0, 200)}). Setting the number's call handler instead.`);
    await sw("PUT", `/api/relay/rest/phone_numbers/${pn.id}`, { call_handler: "relay_script", call_relay_script_url: url });
  }

  const after = await sw("GET", `/api/relay/rest/phone_numbers?filter_number=${encodeURIComponent(number)}`);
  const now = (after.data ?? []).find((n) => n.number === number) ?? {};
  console.log(`${number}: calls go to ${now.calling_handler_resource_id === resourceId ? "the agent" : `${now.call_handler} ${now.call_relay_script_url ?? now.calling_handler_resource_id ?? ""}`.trim()}.`);
  console.log(JSON.stringify(messagingOf(now)) === JSON.stringify(messagingBefore) ? `${number}: messaging settings unchanged.` : `${number}: check its messaging settings in the dashboard.`);
}

async function findCallingAddress(phoneNumberId) {
  let next = "/api/fabric/phone_number_addresses?page_size=100";
  while (next) {
    const page = await sw("GET", next);
    const hit = (page.data ?? []).find((a) => a.phone_number_id === phoneNumberId && a.handler_type === "calling");
    if (hit) return hit;
    next = page.links?.next ?? null;
  }
  return null;
}

function messagingOf(pn) {
  return Object.fromEntries(Object.entries(pn).filter(([k]) => k.startsWith("message_") || k === "messaging_handler_resource_id"));
}
