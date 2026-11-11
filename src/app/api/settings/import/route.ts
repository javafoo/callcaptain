import { NextResponse } from "next/server";
import { draftFromWebsite, publicUrl, readWebsite } from "@/lib/ai";

export const maxDuration = 60;

/** Paste your website: we read it and draft the Agent setup. Nothing is saved until the owner clicks Save. */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const start = publicUrl(url?.trim() ?? "");
  if (!start) return NextResponse.json({ error: "Enter your website address, like harborplumbing.com." }, { status: 400 });
  try {
    const site = await readWebsite(start);
    const draft = await draftFromWebsite(site.text);
    return NextResponse.json({ draft, pages: site.pages, websiteUrl: start.toString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't read that website.";
    console.error("[settings/import]", message);
    return NextResponse.json({ error: message.startsWith("Couldn't") ? message : "Couldn't read that website right now. Try again." }, { status: 502 });
  }
}
