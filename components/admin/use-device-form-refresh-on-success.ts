"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import type { DeviceFormActionState } from "@/app/admin/devices/device-form-state";

/** Refresh server props after a successful useActionState submit (no navigation). */
export function useDeviceFormRefreshOnSuccess(
  state: DeviceFormActionState,
  isPending: boolean,
) {
  const router = useRouter();
  const wasPending = useRef(false);

  useEffect(() => {
    // A follow-up notice must stay visible; refreshing would unmount the form that shows it.
    if (wasPending.current && !isPending && !state.error && !state.followUp) {
      router.refresh();
    }
    wasPending.current = isPending;
  }, [isPending, state.error, state.followUp, router]);
}
