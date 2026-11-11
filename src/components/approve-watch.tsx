"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the customer's page current while they wait: when the technician sends the final bill,
 * it appears without a reload. Re-renders the page from the server every few seconds, only
 * while the tab is visible.
 */
export function ApproveWatch({ every = 4000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
