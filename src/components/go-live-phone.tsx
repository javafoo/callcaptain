import { formatPhone } from "@/lib/phone";
import { CopyNumber, TestPhones } from "./go-live-phone-client";
import { Card, CardHeader, Icon } from "./ui";

/** Go live → the after-hours phone line: the number, call forwarding, and testing from your own phone. */
export function GoLivePhone({ line, testPhones, editable }: { workspace: string | null; line: string | null; testPhones: string[]; editable: boolean }) {
  if (!line) {
    return (
      <Card>
        <CardHeader
          title="Your after-hours phone line"
          subtitle="This account doesn't have a phone line yet. Callers can still reach your agent from the call button on your website."
        />
      </Card>
    );
  }

  const pretty = formatPhone(line);
  const ten = line.replace(/^\+1/, "");
  const digits = `${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
  const ways = [
    {
      title: "Scheduled forwarding",
      body: `In your phone system, carrier account or VoIP app, forward calls to ${pretty} after closing time and turn it off when you open.`,
    },
    {
      title: "Only the calls you miss",
      body: `Ask your carrier for no-answer or busy forwarding to ${pretty}. You still pick up when you can; the agent takes the rest.`,
    },
    {
      title: "Star codes",
      body: (
        <>
          On many US carriers, dial <span className="font-mono text-gray-900">*72 {digits}</span> from the business phone at closing time, and{" "}
          <span className="font-mono text-gray-900">*73</span> in the morning to turn it off.
        </>
      ),
    },
    {
      title: "Google Voice or a VoIP system",
      body: `Open the call forwarding setting, add ${pretty}, and set it for after hours.`,
    },
  ];

  return (
    <Card>
      <CardHeader title="Your after-hours phone line" subtitle="Your agent answers this number around the clock: triage, a card on file with PayPal, and the call to your technician." />
      <div className="grid grid-cols-1 gap-px bg-gray-100 lg:grid-cols-2">
        <div className="flex flex-col gap-5 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-900 px-4 py-3.5 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <Icon name="phone" className="h-5 w-5 text-brand-500" />
              </span>
              <div>
                <p className="text-xs text-ink-300">After-hours line</p>
                <a href={`tel:${line}`} className="text-lg font-semibold tracking-wide hover:text-brand-100">
                  {pretty}
                </a>
              </div>
            </div>
            <CopyNumber number={pretty} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Forward your business line after hours</h3>
            <p className="mt-0.5 text-sm text-gray-500">Keep your number. When you close, send its calls here. Pick whichever your phone service offers.</p>
            <ol className="mt-3 space-y-3">
              {ways.map((w, i) => (
                <li key={w.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">{i + 1}</span>
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{w.title}</p>
                    <p className="text-gray-500">{w.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">Test from your phone</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Add your own cell. Calls from these numbers to {pretty} use your Agent setup and show up in your Jobs. Up to 5 numbers.
          </p>
          <TestPhones initial={testPhones} line={line} editable={editable} />
        </div>
      </div>
    </Card>
  );
}
