"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import type { DeviceFormActionState } from "@/app/admin/devices/device-form-state";

/** Follow `state.next` from device server actions (replaces redirect in useActionState forms). */
export function useDeviceFormActionNav(state: DeviceFormActionState) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!state.next) {
      return;
    }

    const target = new URL(state.next, window.location.origin);

    // Same path: soft refresh only (router.push here often surfaces as a server error).
    if (pathname === target.pathname) {
      router.refresh();
      return;
    }

    router.push(state.next);
  }, [state.next, pathname, router]);
}
