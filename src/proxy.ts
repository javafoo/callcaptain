import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, DEMO_WS, WS_COOKIE, adminToken, newWorkspaceId, readWorkspaceToken, workspaceToken } from "@/lib/workspace-id";

/**
 * Gives every browser its own workspace, so each visitor gets their own business and jobs
 * without signing up. The cookie holds a signed access token, so it can't be guessed or forged
 * from the public workspace id in a website's embed snippet.
 *
 * `?workspace=<access token>` opens a workspace on another device (the owner's phone). The
 * public demo line's workspace needs `?workspace=demo&key=<ADMIN_KEY>`.
 */

const YEAR = 60 * 60 * 24 * 365;
const cookie = (name: string, value: string) => ({
  name,
  value,
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: YEAR,
});

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const wanted = url.searchParams.get("workspace");

  if (wanted !== null) {
    // Switch workspaces, then drop the token (and any key) from the address bar.
    const clean = url.clone();
    clean.searchParams.delete("workspace");
    clean.searchParams.delete("key");
    const res = NextResponse.redirect(clean);
    const adminKey = process.env.ADMIN_KEY;
    const opened = await readWorkspaceToken(wanted);
    if (opened && opened !== DEMO_WS) {
      res.cookies.set(cookie(WS_COOKIE, wanted));
    } else if (wanted === DEMO_WS && adminKey && url.searchParams.get("key") === adminKey) {
      res.cookies.set(cookie(WS_COOKIE, await workspaceToken(DEMO_WS)));
      res.cookies.set(cookie(ADMIN_COOKIE, await adminToken(adminKey)));
    }
    return res;
  }

  if (await readWorkspaceToken(request.cookies.get(WS_COOKIE)?.value)) return NextResponse.next();

  // First visit (or an old, unsigned cookie): open a fresh workspace and let this same request see it.
  const token = await workspaceToken(newWorkspaceId());
  request.cookies.set(WS_COOKIE, token);
  const headers = new Headers(request.headers);
  headers.set("cookie", request.cookies.toString());
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(cookie(WS_COOKIE, token));
  return res;
}

export const config = {
  // Everything except static files and the webhooks SignalWire and PayPal call (they have no cookies).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|embed.js|voices/|icons/|sw.js|manifest.webmanifest|api/swml|api/swaig|api/transcript|api/post-prompt|api/pay/|api/paypal/webhook).*)",
  ],
};
