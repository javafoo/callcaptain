import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s · Call Captain",
    default: "Call Captain · AI after-hours dispatcher for plumbing & HVAC",
  },
  description:
    "Ava, the AI after-hours dispatcher for plumbing and HVAC companies, keeps the caller safe and secures the visit with a PayPal hold before the truck rolls. Charged only after the job.",
  openGraph: {
    type: "website",
    siteName: "Call Captain",
    locale: "en_US",
    title: "Call Captain · Answer every 2 AM emergency. Never roll a truck for free.",
    description: "Ava answers your after-hours line, keeps the caller safe, and secures the visit with PayPal before the truck rolls. Charged only after the job.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
