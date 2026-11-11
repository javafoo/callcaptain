import { connection, NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push";

/** The VAPID public key browsers subscribe with. Public by design; the private key never leaves the server. */
export async function GET() {
  await connection(); // read the key at request time, not at build time
  return NextResponse.json({ publicKey: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
