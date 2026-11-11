import type { ComponentProps } from "react";
import { Icon } from "@/components/ui";

/**
 * The app's icons (components/ui.tsx) plus the few the landing page needs on top,
 * drawn in the same 24px, 1.8 stroke style.
 */

type UiIconName = ComponentProps<typeof Icon>["name"];

const EXTRA = {
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10.3 20.5a2 2 0 0 0 3.4 0" />,
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  flame: <path d="M12 3c.8 3.2 5 5.4 5 10.3A5 5 0 0 1 7 13.5c0-2 .9-3.6 2.2-4.8.2 1.5.9 2.6 2 3.2-.2-3 0-5.8.8-8.9z" />,
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  minus: <path d="M7 12h10" />,
  cross: <path d="M8 8l8 8M16 8l-8 8" />,
  forward: (
    <>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
      <path d="M15 3h6v6M21 3l-6 6" />
    </>
  ),
  refund: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h1M20 14v1" />
    </>
  ),
  droplet: <path d="M12 3.5s6 6.3 6 10.7a6 6 0 0 1-12 0c0-4.4 6-10.7 6-10.7z" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  browser: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01" />
    </>
  ),
  ledger: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  beaker: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9" />,
} as const;

type ExtraName = keyof typeof EXTRA;
export type GlyphName = UiIconName | ExtraName;

function isExtra(name: GlyphName): name is ExtraName {
  return name in EXTRA;
}

export function Glyph({ name, className = "h-5 w-5" }: { name: GlyphName; className?: string }) {
  if (!isExtra(name)) return <Icon name={name} className={className} />;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {EXTRA[name]}
    </svg>
  );
}
