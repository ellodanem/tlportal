"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { DeviceFormActionState } from "@/app/admin/devices/device-form-state";

/** Follow `state.next` from device server actions (replaces redirect in useActionState forms). */
export function useDeviceFormActionNav(state: DeviceFormActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.next) {
      router.push(state.next);
    }
  }, [state.next, router]);
}
