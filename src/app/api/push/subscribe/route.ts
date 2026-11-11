import { NextResponse } from "next/server";
import { isSameOrigin, listDevices, parseSubscription, removeSubscription, saveSubscription } from "@/lib/push";
import { canEdit, currentWorkspace } from "@/lib/workspace";

/**
 * This browser's alerts on or off.
 *   POST   { endpoint, keys: { p256dh, auth }, replaces? } → saved under the workspace in the cookie
 *   DELETE { endpoint }                                    → this device stops getting alerts
 * Both answer with the workspace's devices.
 */

const forbidden = () => NextResponse.json({ error: "Open this page from Call Captain." }, { status: 403 });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  const workspace = await currentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Open Call Captain in this browser first." }, { status: 401 });
  if (!(await canEdit(workspace))) {
    return NextResponse.json({ error: "Alerts for the public demo line go to its owner. Open your own workspace to get alerts." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { replaces?: unknown } | null;
  const sub = parseSubscription(body);
  if (!sub) return NextResponse.json({ error: "This browser sent a push subscription we can't use." }, { status: 400 });
  const replaces = typeof body?.replaces === "string" ? body.replaces : null;
  await saveSubscription(workspace, sub, req.headers.get("user-agent"), replaces);
  return NextResponse.json({ ok: true, devices: await listDevices(workspace) }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || !body.endpoint) return NextResponse.json({ error: "Missing the push endpoint." }, { status: 400 });
  await removeSubscription(body.endpoint);
  const workspace = await currentWorkspace();
  return NextResponse.json({ ok: true, devices: workspace ? await listDevices(workspace) : [] }, { headers: { "Cache-Control": "no-store" } });
}
