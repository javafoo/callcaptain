import { listDevices, vapidPublicKey } from "@/lib/push";
import { DEMO_WS } from "@/lib/workspace-id";
import { PhoneAlerts } from "./phone-alerts";

/**
 * Go live → alerts on the owner's (and technician's) phone. The access token only goes into the
 * QR code and the copied link that open this workspace on the phone; it's never shown as text.
 */
export async function GoLiveNotifications({ workspace, accessToken }: { workspace: string | null; accessToken: string | null }) {
  const devices = workspace ? await listDevices(workspace).catch(() => []) : [];
  return (
    <PhoneAlerts
      accessToken={workspace && workspace !== DEMO_WS ? accessToken : null}
      demo={workspace === DEMO_WS}
      publicKey={vapidPublicKey()}
      initialDevices={devices}
    />
  );
}
