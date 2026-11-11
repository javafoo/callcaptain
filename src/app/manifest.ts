import type { MetadataRoute } from "next";

/** Installable owner app: on the Home Screen, opens straight to Jobs (iPhone only allows alerts once installed). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "Call Captain",
    short_name: "Call Captain",
    description: "Your AI after-hours dispatcher. Get an alert the moment Ava secures a job.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    // Brand ink navy (--color-ink-900), the app's header color.
    background_color: "#0d1f33",
    theme_color: "#0d1f33",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Jobs", url: "/dashboard" },
      { name: "Payments", url: "/payments" },
      { name: "Go live", url: "/go-live" },
    ],
  };
}
