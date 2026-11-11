/**
 * Server-side configuration. Everything here is sandbox-only: PayPal calls go to
 * api-m.sandbox.paypal.com and never touch real money.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See README.md → Run it yourself.`);
  return value;
}

export const env = {
  get paypal() {
    return {
      clientId: required("PAYPAL_CLIENT_ID"),
      secret: required("PAYPAL_CLIENT_SECRET"),
      base: "https://api-m.sandbox.paypal.com",
    };
  },
  get signalwire() {
    return {
      space: required("SIGNALWIRE_SPACE_URL").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      projectId: required("SIGNALWIRE_PROJECT_ID"),
      apiToken: required("SIGNALWIRE_API_TOKEN"),
      /** Fabric address of the SWML webhook resource the browser dials (scripts/provision-signalwire.mjs). */
      webAddressId: process.env.SIGNALWIRE_WEB_ADDRESS_ID ?? "",
      webAddress: process.env.SIGNALWIRE_WEB_ADDRESS ?? "",
    };
  },
  get signalwireReady() {
    return Boolean(
      process.env.SIGNALWIRE_SPACE_URL &&
        process.env.SIGNALWIRE_PROJECT_ID &&
        process.env.SIGNALWIRE_API_TOKEN &&
        process.env.SIGNALWIRE_WEB_ADDRESS_ID &&
        process.env.SIGNALWIRE_WEB_ADDRESS,
    );
  },
  /** Shared secret SignalWire sends back on every webhook (?key=). SWAIG requests are not signed. */
  get webhookSecret() {
    return required("WEBHOOK_SECRET");
  },
};

/** The public origin of this deployment, as SignalWire and browsers reach it. */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function hasWebhookKey(req: Request): boolean {
  return new URL(req.url).searchParams.get("key") === env.webhookSecret;
}
