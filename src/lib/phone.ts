/** US phone numbers: what people type, what SignalWire wants (E.164), and what people read. */

export function toE164(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export function formatPhone(e164: string | null | undefined): string {
  const d = (e164 ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : (e164 ?? "");
}

/** The after-hours number that rings Ava on this deployment, if it has one (CALL_CAPTAIN_PHONE). Server only. */
export function phoneLine(): string | null {
  return toE164(process.env.CALL_CAPTAIN_PHONE);
}
