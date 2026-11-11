import { env } from "./env";

/**
 * The few SignalWire REST calls this app needs (https://signalwire.com/docs/apis):
 *  - guest tokens so a browser can dial exactly one address (Fabric guest tokens)
 *  - calling.ai_message to tell the live agent the moment PayPal approves a hold
 *  - dial, to phone the on-call technician from the after-hours line
 */

async function sw<T>(path: string, body: unknown): Promise<T> {
  const { space, projectId, apiToken } = env.signalwire;
  const res = await fetch(`https://${space}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SignalWire ${path} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** POST /api/fabric/guests/tokens: a token that can only dial our agent, for ten minutes. */
export async function createGuestToken(ttlSeconds = 600): Promise<{ token: string; destination: string }> {
  const { webAddressId, webAddress } = env.signalwire;
  const res = await sw<{ token: string }>("/api/fabric/guests/tokens", {
    allowed_addresses: [webAddressId],
    expire_at: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  return { token: res.token, destination: webAddress };
}

/**
 * POST /api/calling/calls { command: "calling.ai_message" }: inject a turn into the live
 * conversation. role "user" makes the agent answer right away, which is what we want when
 * PayPal confirms the hold while the caller is still on the line.
 */
export async function tellAgent(callId: string, text: string): Promise<void> {
  await sw("/api/calling/calls", {
    command: "calling.ai_message",
    id: callId,
    params: { role: "user", message_text: text },
  });
}

/** Call states SignalWire can report to a dial's status_url (call state status callback). */
export type CallState = "created" | "ringing" | "answered" | "ending" | "ended";

export type OutboundCall = {
  /** E.164 number we own; also shown as the caller ID. */
  from: string;
  /** E.164 destination. */
  to: string;
  /** SWML webhook SignalWire fetches when the call connects. */
  url: string;
  /** Receives `calling.call.state` callbacks for `statusEvents`. */
  statusUrl: string;
  statusEvents: CallState[];
  ringSeconds: number;
  /** SignalWire rejects the call if the route costs more per minute than this, in dollars. */
  maxPricePerMinute: number;
};

/** The exact `dial` command we send, kept separate so it can be inspected without placing a call. */
export function dialCommand(call: OutboundCall) {
  return {
    command: "dial",
    params: {
      from: call.from,
      to: call.to,
      caller_id: call.from,
      url: call.url,
      status_url: call.statusUrl,
      status_events: call.statusEvents,
      timeout: call.ringSeconds,
      max_price_per_minute: call.maxPricePerMinute,
    },
  };
}

/**
 * POST /api/calling/calls { command: "dial" }: place a phone call that runs the SWML at `url`
 * (https://signalwire.com/docs/apis/rest/calls/call-commands). Returns the new call's id.
 */
export async function placeCall(call: OutboundCall): Promise<{ id: string }> {
  const res = await sw<{ id?: string; call_id?: string }>("/api/calling/calls", dialCommand(call));
  const id = res.id ?? res.call_id;
  if (!id) throw new Error("SignalWire did not return a call id");
  return { id };
}
