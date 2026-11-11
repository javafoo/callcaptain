import { NextResponse } from "next/server";
import { isSameOrigin, listDevices, pushToWorkspace, takeRate } from "@/lib/push";
import { canEdit, currentWorkspace } from "@/lib/workspace";

/**
 * "Send a test alert" on Go live: one alert to every device of the caller's own workspace.
 * At most one every 10 seconds and 20 an hour per workspace, and 60 an hour per IP address.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Open this page from Call Captain." }, { status: 403 });
  const workspace = await currentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Open Call Captain in this browser first." }, { status: 401 });
  if (!(await canEdit(workspace))) {
    return NextResponse.json({ error: "Alerts for the public demo line go to its owner. Open your own workspace to get alerts." }, { status: 403 });
  }

  const devices = await listDevices(workspace);
  if (!devices.length) {
    return NextResponse.json({ error: "No device has alerts turned on yet. Turn them on first.", devices }, { status: 409 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const [perWorkspace, perIp] = await Promise.all([takeRate(`test:${workspace}`, 10, 20), takeRate(`test-ip:${ip}`, 2, 60)]);
  if (!perWorkspace || !perIp) {
    return NextResponse.json({ error: "That was quick. Wait a few seconds before sending another test." }, { status: 429, headers: { "Retry-After": "10" } });
  }

  const result = await pushToWorkspace(
    workspace,
    {
      title: "Test alert from Call Captain",
      body: "Alerts are working. You'll get one for every new emergency, secured visit, dispatch and payment.",
      url: "/dashboard",
      tag: "test",
      kind: "test",
    },
    "test",
  );
  console.log("[push] test", workspace, `${result.sent} sent, ${result.removed} removed, ${result.failed} failed`);
  return NextResponse.json({ ...result, devices: await listDevices(workspace) }, { headers: { "Cache-Control": "no-store" } });
}
