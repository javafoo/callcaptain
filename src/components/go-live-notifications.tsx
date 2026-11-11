import { Card, CardHeader } from "./ui";

/** Go live → alerts on the owner's (and technician's) phone. */
export function GoLiveNotifications({ workspace, accessToken }: { workspace: string | null; accessToken: string | null }) {
  void workspace;
  void accessToken;
  return (
    <Card>
      <CardHeader title="Get alerts on your phone" subtitle="New emergencies, holds placed, dispatches and payments." />
    </Card>
  );
}
