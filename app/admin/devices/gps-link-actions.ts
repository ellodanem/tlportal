"use server";

import { revalidatePath } from "next/cache";

import type { DeviceFormActionState } from "@/app/admin/devices/device-form-state";
import { getSession } from "@/lib/auth/get-session";
import { upsertGpsLink } from "@/lib/services/device-link-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

export async function updateDeviceGpsLink(
  _prev: DeviceFormActionState,
  formData: FormData,
): Promise<DeviceFormActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const deviceId = String(formData.get("deviceId") ?? "").trim();
  if (!deviceId) {
    return { error: "Missing device id." };
  }

  const portalUrl = String(formData.get("portalUrl") ?? "").trim() || null;
  const externalDeviceId = String(formData.get("externalDeviceId") ?? "").trim() || null;
  const externalAccountRef = String(formData.get("externalAccountRef") ?? "").trim() || null;

  try {
    await upsertGpsLink({
      deviceId,
      provider: "traqcare",
      portalUrl,
      externalDeviceId,
      externalAccountRef,
    });
    await recordOperationalEvent({
      category: "gps.link.updated",
      summary: "GPS provider link updated (Traqcare)",
      deviceId,
      actorUserId: session.sub,
      payload: { provider: "traqcare" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save GPS link.";
    return { error: message };
  }

  revalidatePath(`/admin/devices/${deviceId}/edit`);
  revalidatePath("/admin/devices");
  return { error: null };
}
