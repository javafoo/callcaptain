import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

export const alt = "Call Captain: answer every 2 AM emergency. Never roll a truck for free.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK_950 = "#08131f";
const INK_900 = "#0d1f33";
const INK_800 = "#15304d";
const INK_300 = "#9fb3c8";
const BRAND_500 = "#12b76a";

/**
 * Inter, the app's font, as a TTF from Google Fonts (ImageResponse can't read next/font's woff2).
 * Cached, so the image stays prerendered. If the fetch fails, the bundled default font is used.
 */
async function inter(weight: 500 | 700): Promise<ArrayBuffer | null> {
  "use cache";
  cacheLife("max");
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.text());
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const font = await fetch(src, { signal: AbortSignal.timeout(8000) });
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function Shield({ size: px, color = "white" }: { size: number; color?: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function Truck({ size: px, color }: { size: number; color: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

function Chip({ icon, tint, title, note }: { icon: ReactNode; tint: string; title: string; note: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, background: "white", borderRadius: 18, padding: "16px 24px 16px 16px", boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 12, background: tint }}>{icon}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 23, fontWeight: 700, color: "#101828" }}>{title}</div>
        <div style={{ fontSize: 17, fontWeight: 500, color: "#475467", marginTop: 2 }}>{note}</div>
      </div>
    </div>
  );
}

export default async function OpengraphImage() {
  const [medium, bold] = await Promise.all([inter(500), inter(700)]);
  const fonts = [
    ...(medium ? [{ name: "Inter", data: medium, weight: 500 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Inter", data: bold, weight: 700 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "56px 72px 60px",
          color: "white",
          fontFamily: fonts.length ? "Inter" : undefined,
          backgroundColor: INK_900,
          // A soft green glow top right over the navy gradient (one layered background renders cleanly in satori).
          backgroundImage: `radial-gradient(circle at 92% 0%, rgba(18,183,106,0.30) 0%, rgba(18,183,106,0) 45%), linear-gradient(135deg, ${INK_800} 0%, ${INK_900} 45%, ${INK_950} 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, borderRadius: 15, background: BRAND_500 }}>
              <Shield size={34} />
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>Call Captain</div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 19,
              fontWeight: 500,
              color: INK_300,
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 9999,
              padding: "8px 18px",
            }}
          >
            <div style={{ width: 9, height: 9, borderRadius: 9999, background: BRAND_500 }} />
            AI after-hours dispatcher for plumbing &amp; HVAC
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 64 }}>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.06 }}>Answer every 2 AM emergency.</div>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.06, color: BRAND_500 }}>Never roll a truck for free.</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: INK_300, marginTop: 26, lineHeight: 1.4, maxWidth: 900 }}>
            Ava answers your after-hours line, keeps the caller safe, and secures the visit with PayPal before the truck rolls.
          </div>
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />

        <div style={{ display: "flex", gap: 20 }}>
          <Chip icon={<Shield size={28} color="#027a48" />} tint="#ecfdf3" title="Hold placed · $149 · PayPal" note="$0 charged until the job is done" />
          <Chip icon={<Truck size={28} color="#1d4ed8" />} tint="#eff6ff" title="Marcus dispatched · 35–45 min" note="Accepted by voice at 2:10 AM" />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
