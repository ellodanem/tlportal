"use client";

import { useEffect } from "react";

/** Fires one visit beacon per browser session; renders nothing. */
export function VisitTracker({ source }: { source: string | null }) {
  useEffect(() => {
    const key = "vehicle_qr_visit_sent";
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked (private mode): fall through and just send.
    }

    const body = JSON.stringify({ src: source, ref: document.referrer || null });
    const url = "/api/vehicle/track";
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "application/json" })))) {
      fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
        () => {},
      );
    }
  }, [source]);

  return null;
}
