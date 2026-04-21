"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INACTIVITY_MS = 30 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function InactivityTimeout() {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const signedOutRef = useRef(false);

  useEffect(() => {
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const onActivity = () => {
      if (signedOutRef.current) return;
      markActivity();
    };

    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    for (const eventName of events) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    window.addEventListener("focus", onActivity);
    markActivity();

    const touchTimer = window.setInterval(async () => {
      if (signedOutRef.current) return;
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= INACTIVITY_MS) return;
      try {
        await fetch("/api/auth/touch", { method: "POST", credentials: "same-origin" });
      } catch {
        // Ignore transient network failures; middleware/JWT still enforce expiry.
      }
    }, TOUCH_INTERVAL_MS);

    const idleTimer = window.setInterval(async () => {
      if (signedOutRef.current) return;
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor < INACTIVITY_MS) return;
      signedOutRef.current = true;
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      } finally {
        router.replace("/login?reason=timeout");
        router.refresh();
      }
    }, 30 * 1000);

    return () => {
      window.clearInterval(touchTimer);
      window.clearInterval(idleTimer);
      for (const eventName of events) {
        window.removeEventListener(eventName, onActivity);
      }
      window.removeEventListener("focus", onActivity);
    };
  }, [router]);

  return null;
}
