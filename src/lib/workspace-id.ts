/**
 * Workspace ids, safe to import anywhere (the proxy included).
 *
 * Every visitor gets their own workspace: their own business settings and their own jobs, with
 * no sign-up. "demo" is the business behind the public phone line; only the admin can change it.
 */

export const WS_COOKIE = "cc_ws";
export const ADMIN_COOKIE = "cc_admin";
export const DEMO_WS = "demo";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function isWorkspaceId(v: unknown): v is string {
  return typeof v === "string" && (v === DEMO_WS || /^ws_[a-z0-9]{12}$/.test(v));
}

export function newWorkspaceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `ws_${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** What the admin cookie holds: a hash of ADMIN_KEY, never the key itself. */
export async function adminToken(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`callcaptain-admin:${key}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
