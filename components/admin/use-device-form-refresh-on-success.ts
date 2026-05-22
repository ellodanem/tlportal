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
    if (wasPending.current && !isPending && !state.error) {
      router.refresh();
    }
    wasPending.current = isPending;
  }, [isPending, state.error, router]);
}
