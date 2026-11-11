import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Call Captain",
  description: "An AI dispatcher for after-hours home repair calls. It triages the emergency and secures the service call with a PayPal hold that's charged only after the job.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              Call Captain
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">Live demo</Link>
              <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">Owner dashboard</Link>
              <a href="https://github.com/javafoo/callcaptain" className="hidden rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block">GitHub</a>
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6">
            <span>PayPal sandbox only. No real money moves. Harbor Plumbing &amp; Heating is a fictional business.</span>
            <span>Built for the PayPal AI Hackathon · MIT licensed</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
