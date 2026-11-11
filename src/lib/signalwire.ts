import { env } from "./env";

/**
 * The few SignalWire REST calls this app needs (https://signalwire.com/docs/apis):
 *  - guest tokens so a browser can dial exactly one address (Fabric guest tokens)
 *  - calling.ai_message to tell the live agent the moment PayPal approves a hold
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
