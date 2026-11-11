import { randomUUID } from "node:crypto";
import { env } from "./env";

/**
 * PayPal REST (sandbox). The whole product is built on authorize-now, capture-later:
 *
 *   Orders v2, intent AUTHORIZE  → a hold on the customer's PayPal / Venmo / card
 *   /v2/payments/authorizations/{id}/capture → charge the final amount after the job
 *   /v2/payments/authorizations/{id}/void    → release the hold, nothing charged
 *   Orders v2, intent CAPTURE    → a separate balance payment (Pay Later eligible)
 *
 * Docs: https://developer.paypal.com/docs/api/orders/v2/ and /docs/api/payments/v2/
 */

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public issue: string | null,
    public debugId: string | null,
  ) {
    super(message);
  }
}

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { clientId, secret, base } = env.paypal;
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new PayPalError(body.error_description ?? "PayPal auth failed", res.status, null, null);
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
  return cached.token;
}

async function pp<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${env.paypal.base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.idempotencyKey ? { "PayPal-Request-Id": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (res.status === 204) return {} as T;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const details = (body.details as { issue?: string; description?: string }[] | undefined)?.[0];
    throw new PayPalError(
      details?.description ?? (body.message as string) ?? `PayPal ${res.status}`,
      res.status,
      details?.issue ?? (body.name as string) ?? null,
      (body.debug_id as string) ?? null,
    );
  }
  return body as T;
}

const usd = (cents: number) => ({ currency_code: "USD", value: (cents / 100).toFixed(2) });

type Authorization = { id: string; status: string; expiration_time?: string; amount?: { value: string } };
type Order = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  payment_source?: { card?: { last_digits?: string; brand?: string }; paypal?: { email_address?: string }; venmo?: { email_address?: string } };
  purchase_units?: { payments?: { authorizations?: Authorization[]; captures?: { id: string; status: string }[] } }[];
};

/** Step 1 (browser path): an order the caller approves in the PayPal popup. Nothing is held until authorizeOrder(). */
export async function createHoldOrder(jobId: string, cents: number, businessName: string): Promise<Order> {
  return pp<Order>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `hold-${jobId}-${cents}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: jobId,
          custom_id: jobId,
          description: `${businessName}: after-hours service call (hold only, charged after the job)`,
          soft_descriptor: "CALL CAPTAIN",
          amount: usd(cents),
        },
      ],
    },
  });
}

/** Step 2 (browser path): after approval, place the hold. Returns the authorization. */
export async function authorizeOrder(orderId: string): Promise<{ order: Order; authorization: Authorization }> {
  const order = await pp<Order>(`/v2/checkout/orders/${orderId}/authorize`, { method: "POST", body: {}, idempotencyKey: `auth-${orderId}` });
  const authorization = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!authorization) throw new PayPalError("PayPal returned no authorization", 502, null, null);
  return { order, authorization };
}

export async function getOrder(orderId: string): Promise<Order> {
  return pp<Order>(`/v2/checkout/orders/${orderId}`);
}

/**
 * Keypad path: the card digits SignalWire collected (the AI never hears them) go straight
 * to PayPal as an AUTHORIZE order with payment_source.card. Same hold, same capture/void.
 */
export async function authorizeCard(
  jobId: string,
  cents: number,
  businessName: string,
  card: { number: string; expiryMonth: string; expiryYear: string; cvv?: string; postalCode?: string; name?: string },
): Promise<{ order: Order; authorization: Authorization }> {
  const year = card.expiryYear.length === 2 ? `20${card.expiryYear}` : card.expiryYear;
  const order = await pp<Order>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `keypad-${jobId}-${randomUUID()}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: jobId,
          custom_id: jobId,
          description: `${businessName}: after-hours service call (hold only, charged after the job)`,
          soft_descriptor: "CALL CAPTAIN",
          amount: usd(cents),
        },
      ],
      payment_source: {
        card: {
          number: card.number,
          expiry: `${year}-${card.expiryMonth.padStart(2, "0")}`,
          ...(card.cvv ? { security_code: card.cvv } : {}),
          ...(card.name ? { name: card.name } : {}),
          ...(card.postalCode ? { billing_address: { postal_code: card.postalCode, country_code: "US" } } : {}),
        },
      },
    },
  });
  const authorization = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!authorization) throw new PayPalError("Card was not authorized", 402, "NO_AUTHORIZATION", null);
  if (authorization.status !== "CREATED") throw new PayPalError(`Card authorization ${authorization.status.toLowerCase()}`, 402, authorization.status, null);
  return { order, authorization };
}

/** Charge part or all of a hold. final=true releases whatever is left. */
export async function captureAuthorization(authorizationId: string, cents: number, invoiceId: string, final = true) {
  return pp<{ id: string; status: string }>(`/v2/payments/authorizations/${authorizationId}/capture`, {
    method: "POST",
    idempotencyKey: `cap-${authorizationId}-${cents}`,
    body: { amount: usd(cents), final_capture: final, invoice_id: invoiceId },
  });
}

/** Release a hold. Nothing is charged. */
export async function voidAuthorization(authorizationId: string) {
  return pp<Record<string, never>>(`/v2/payments/authorizations/${authorizationId}/void`, { method: "POST", idempotencyKey: `void-${authorizationId}` });
}

/** The balance above the hold, paid through PayPal (where Pay Later is offered on eligible amounts). */
export async function createBalanceOrder(jobId: string, cents: number, businessName: string): Promise<Order> {
  return pp<Order>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `balance-${jobId}-${cents}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: `${jobId}-balance`,
          custom_id: jobId,
          description: `${businessName}: remaining balance for the repair`,
          amount: usd(cents),
        },
      ],
    },
  });
}

export async function captureOrder(orderId: string): Promise<Order> {
  return pp<Order>(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", body: {}, idempotencyKey: `capture-${orderId}` });
}

/** What a judge sees next to each PayPal id in the dashboard. */
export function payerLabel(order: Order): string {
  const s = order.payment_source;
  if (s?.card?.last_digits) return `${s.card.brand ?? "Card"} •••• ${s.card.last_digits}`;
  if (s?.venmo) return "Venmo";
  if (s?.paypal) return "PayPal";
  return "PayPal";
}
