import { Card, CardHeader } from "./ui";

/** Go live → the after-hours phone line: the number, call forwarding, and testing from your own phone. */
export function GoLivePhone({ workspace, line }: { workspace: string | null; line: string | null; testPhones: string[]; editable: boolean }) {
  void workspace;
  return (
    <Card>
      <CardHeader title="Your after-hours phone line" subtitle={line ? `Forward your business line to ${line} after hours.` : "No phone line on this deployment yet."} />
    </Card>
  );
}
