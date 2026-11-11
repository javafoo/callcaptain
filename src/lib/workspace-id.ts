/**
 * Workspace ids and access tokens, safe to import anywhere (the proxy included).
 *
 * Every visitor gets their own workspace: their own business settings and their own jobs, with
 * no sign-up. Two different things identify a workspace:
 *  - the workspace id ("ws_…"): public. It's in the website embed snippet and only lets
 *    someone start a call to that business.
 *  - the access token ("ws_….<signature>"): private. It's what the browser cookie and the
 *    "open on your phone" link carry, and the only thing that opens the owner's dashboard.
 * "demo" is the business behind the public phone line; only the admin can change it.
 */

export const WS_COOKIE = "cc_ws";
export const ADMIN_COOKIE = "cc_admin";
export const DEMO_WS = "demo";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const encoder = new TextEncoder();

export function isWorkspaceId(v: unknown): v is string {
  return typeof v === "string" && (v === DEMO_WS || /^ws_[a-z0-9]{12}$/.test(v));
}

export function newWorkspaceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `ws_${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

let signingKey: Promise<CryptoKey> | null = null;

function key(): Promise<CryptoKey> {
  const secret = process.env.WORKSPACE_SECRET || process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing WEBHOOK_SECRET (signs workspace tokens).");
  signingKey ??= crypto.subtle.importKey("raw", encoder.encode(`callcaptain-workspace:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return signingKey;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signature(workspace: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), encoder.encode(workspace)));
  return base64url(mac).slice(0, 27); // 160 bits
}

/** The private access token for a workspace (cookie value, share links). */
export async function workspaceToken(workspace: string): Promise<string> {
  return `${workspace}.${await signature(workspace)}`;
}

/** The workspace an access token opens, or null if it's missing, malformed or forged. */
export async function readWorkspaceToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const workspace = token.slice(0, dot);
  if (!isWorkspaceId(workspace)) return null;
  const given = token.slice(dot + 1);
  const expected = await signature(workspace);
  if (given.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? workspace : null;
}

/** What the admin cookie holds: a hash of ADMIN_KEY, never the key itself. */
export async function adminToken(adminKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`callcaptain-admin:${adminKey}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
