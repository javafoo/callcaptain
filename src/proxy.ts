import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, DEMO_WS, WS_COOKIE, adminToken, isWorkspaceId, newWorkspaceId } from "@/lib/workspace-id";

/**
 * Gives every browser its own workspace (cookie), so each visitor gets their own business and
 * jobs without signing up. `?workspace=<id>` opens a workspace on another device (the owner's
 * phone, say); the public demo line's workspace also needs `&key=<ADMIN_KEY>`.
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
    // Switch workspaces, then drop the parameters (and any key) from the address bar.
    const clean = url.clone();
    clean.searchParams.delete("workspace");
    clean.searchParams.delete("key");
    const res = NextResponse.redirect(clean);
    const key = process.env.ADMIN_KEY;
    if (isWorkspaceId(wanted) && wanted !== DEMO_WS) {
      res.cookies.set(cookie(WS_COOKIE, wanted));
    } else if (wanted === DEMO_WS && key && url.searchParams.get("key") === key) {
      res.cookies.set(cookie(WS_COOKIE, DEMO_WS));
      res.cookies.set(cookie(ADMIN_COOKIE, await adminToken(key)));
    }
    return res;
  }

  if (isWorkspaceId(request.cookies.get(WS_COOKIE)?.value)) return NextResponse.next();

  // First visit: open a fresh workspace and let this same request already see it.
  const workspace = newWorkspaceId();
  request.cookies.set(WS_COOKIE, workspace);
  const headers = new Headers(request.headers);
  headers.set("cookie", request.cookies.toString());
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(cookie(WS_COOKIE, workspace));
  return res;
}

export const config = {
  // Everything except static files and the webhooks SignalWire and PayPal call (they have no cookies).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|embed.js|voices/|icons/|sw.js|manifest.webmanifest|api/swml|api/swaig|api/transcript|api/post-prompt|api/pay/|api/paypal/webhook).*)",
  ],
};
