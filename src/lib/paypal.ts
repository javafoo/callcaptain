import { randomUUID } from "node:crypto";
import { env } from "./env";

/**
 * PayPal REST (sandbox). The whole product is built on authorize-now, capture-later:
 *
 *   Orders v2, intent AUTHORIZE  → a hold on the customer's PayPal / Venmo / card
 *   /v2/payments/authorizations/{id}/capture → charge the final amount after the job
 *   /v2/payments/authorizations/{id}/void    → release the hold, nothing charged
 *   Orders v2, intent CAPTURE    → a separate balance payment (Pay Later eligible)
 *   /v2/payments/captures/{id}/refund        → give money back, in full or in part
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

export async function accessToken(): Promise<string> {
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

/** Any PayPal REST call (sandbox), with auth, idempotency key and typed errors. */
export async function pp<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
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

export type Authorization = { id: string; status: string; expiration_time?: string; amount?: { value: string } };
export type Order = {
  id: string;
  status: string;
  intent?: string;
  links?: { rel: string; href: string }[];
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  payment_source?: { card?: { last_digits?: string; brand?: string }; paypal?: { email_address?: string }; venmo?: { email_address?: string } };
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    payments?: { authorizations?: Authorization[]; captures?: { id: string; status: string; amount?: { value: string } }[] };
  }[];
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

export type Refund = {
  id: string;
  /** COMPLETED, PENDING (finishes later), FAILED or CANCELLED. */
  status: string;
  amount?: { value: string; currency_code: string };
  create_time?: string;
};

/**
 * Give back part or all of a capture. The idempotency key makes a retried click or request
 * return the same refund instead of refunding twice. PayPal refuses anything above what's
 * left on the capture.
 */
export async function refundCapture(captureId: string, cents: number, idempotencyKey: string, noteToPayer?: string): Promise<Refund> {
  return pp<Refund>(`/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    idempotencyKey,
    body: { amount: usd(cents), ...(noteToPayer ? { note_to_payer: noteToPayer.slice(0, 255) } : {}) },
  });
}

/** How a payment method reads in the dashboard and the ledger. */
export function payerLabel(order: Order): string {
  const s = order.payment_source;
  if (s?.card?.last_digits) return `${s.card.brand ?? "Card"} •••• ${s.card.last_digits}`;
  if (s?.venmo) return "Venmo";
  if (s?.paypal) return "PayPal";
  return "PayPal";
}

/*
 * Card on file (PayPal Vault v3, "save payment method without purchase"):
 *
 *   /v3/vault/setup-tokens     → what the PayPal button / card fields approve on the caller's screen
 *   /v3/vault/payment-tokens   → the saved card or PayPal account, $0 charged
 *   Orders v2 + vault_id       → charge it later (final bill, or the trip fee) as a merchant-initiated payment
 *
 * Docs: https://developer.paypal.com/docs/api/payment-tokens/v3/
 */

export type VaultKind = "card" | "paypal" | "venmo";

/** Step 1: a setup token for the caller to approve. For cards, PayPal's card fields collect the number. */
export async function createSetupToken(kind: VaultKind, jobId: string, returnUrl: string, businessName: string): Promise<string> {
  const experience = { return_url: returnUrl, cancel_url: returnUrl, brand_name: businessName.slice(0, 127), shipping_preference: "NO_SHIPPING" };
  const payment_source =
    kind === "card"
      ? { card: { verification_method: "SCA_WHEN_REQUIRED", experience_context: { return_url: returnUrl, cancel_url: returnUrl } } }
      : { [kind]: { usage_type: "MERCHANT", customer_type: "CONSUMER", permit_multiple_payment_tokens: false, experience_context: experience } };
  const token = await pp<{ id: string }>("/v3/vault/setup-tokens", {
    method: "POST",
    idempotencyKey: `setup-${jobId}-${kind}-${randomUUID()}`,
    body: { payment_source },
  });
  return token.id;
}

type PaymentToken = {
  id: string;
  payment_source?: { card?: { brand?: string; last_digits?: string }; paypal?: { email_address?: string }; venmo?: { email_address?: string } };
};

/** Step 2: the caller approved. Turn the setup token into a saved payment method. */
export async function createPaymentToken(
  setupTokenId: string,
): Promise<{ id: string; type: VaultKind; label: string; last4: string | null; email: string | null }> {
  const t = await pp<PaymentToken>("/v3/vault/payment-tokens", {
    method: "POST",
    idempotencyKey: `pt-${setupTokenId}`,
    body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
  });
  const s = t.payment_source ?? {};
  if (s.card) {
    const brand = s.card.brand ? s.card.brand.charAt(0) + s.card.brand.slice(1).toLowerCase() : "Card";
    return { id: t.id, type: "card", label: `${brand} •••• ${s.card.last_digits ?? ""}`.trim(), last4: s.card.last_digits ?? null, email: null };
  }
  if (s.venmo) return { id: t.id, type: "venmo", label: "Venmo", last4: null, email: s.venmo.email_address ?? null };
  return {
    id: t.id,
    type: "paypal",
    label: s.paypal?.email_address ? `PayPal (${s.paypal.email_address})` : "PayPal",
    last4: null,
    email: s.paypal?.email_address ?? null,
  };
}

/** Step 3: charge the saved method, with the customer not present (merchant-initiated). */
export async function chargeSaved(
  vault: { id: string; type: VaultKind },
  cents: number,
  jobId: string,
  description: string,
  idempotencyKey: string,
): Promise<{ orderId: string; captureId: string }> {
  const payment_source =
    vault.type === "card"
      ? { card: { vault_id: vault.id, stored_credential: { payment_initiator: "MERCHANT", payment_type: "UNSCHEDULED", usage: "SUBSEQUENT" } } }
      : { [vault.type]: { vault_id: vault.id } };
  const order = await pp<Order>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey,
    body: {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: jobId, custom_id: jobId, invoice_id: idempotencyKey, description: description.slice(0, 127), soft_descriptor: "CALL CAPTAIN", amount: usd(cents) }],
      payment_source,
    },
  });
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
    throw new PayPalError(`PayPal didn't complete the charge (${capture?.status ?? order.status}).`, 402, capture?.status ?? order.status, null);
  }
  return { orderId: order.id, captureId: capture.id };
}

/** Forget the saved method (the visit was cancelled before anything was owed). */
export async function deletePaymentToken(id: string) {
  return pp<Record<string, never>>(`/v3/vault/payment-tokens/${id}`, { method: "DELETE" });
}
