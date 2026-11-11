import { listDevices, vapidPublicKey } from "@/lib/push";
import { DEMO_WS } from "@/lib/workspace-id";
import { PhoneAlerts } from "./phone-alerts";

/** Go live → alerts on the owner's (and technician's) phone. */
export async function GoLiveNotifications({ workspace }: { workspace: string | null }) {
  const devices = workspace ? await listDevices(workspace).catch(() => []) : [];
  return <PhoneAlerts workspace={workspace} demo={workspace === DEMO_WS} publicKey={vapidPublicKey()} initialDevices={devices} />;
}
