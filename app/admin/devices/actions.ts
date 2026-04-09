"use server";

import { DeviceCondition, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { parseDeviceTagsInput, parseDeviceUsagePurpose } from "@/lib/admin/device-usage-purpose";
import { prisma } from "@/lib/db";

import type { DeviceFormActionState } from "./device-form-state";

const CONDITIONS = new Set<string>(["new", "refurbished", "faulty"]);

function parseOptionalString(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v.length ? v : null;
}

function normalizeImei(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export async function registerDevice(
  _prev: DeviceFormActionState,
  formData: FormData,
): Promise<DeviceFormActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const deviceModelId = String(formData.get("deviceModelId") ?? "").trim();
  const imei = normalizeImei(String(formData.get("imei") ?? ""));
  const conditionRaw = String(formData.get("condition") ?? "new").trim();
  const condition: DeviceCondition = CONDITIONS.has(conditionRaw)
    ? (conditionRaw as DeviceCondition)
    : "new";

  const serialNumber = parseOptionalString(formData, "serialNumber");
  const label = parseOptionalString(formData, "label");
  const firmwareVersion = parseOptionalString(formData, "firmwareVersion");
  const notes = parseOptionalString(formData, "notes");
  const usagePurpose = parseDeviceUsagePurpose(String(formData.get("usagePurpose") ?? ""));
  const tags = parseDeviceTagsInput(String(formData.get("tags") ?? ""));

  const simCardIdRaw = String(formData.get("simCardId") ?? "").trim();
  const simCardId = simCardIdRaw.length ? simCardIdRaw : null;

  const customerIdRaw = String(formData.get("customerId") ?? "").trim();
  const customerId = customerIdRaw.length ? customerIdRaw : null;

  const startDateRaw = String(formData.get("startDate") ?? "").trim();

  if (!deviceModelId) {
    return { error: "Select a device model." };
  }
  if (!imei || imei.length < 8) {
    return { error: "Enter a valid IMEI (at least 8 characters)." };
  }

  if (customerId && !startDateRaw) {
    return { error: "Choose a service start date when assigning to a customer." };
  }

  let startDate: Date | null = null;
  if (startDateRaw) {
    const d = new Date(startDateRaw + "T12:00:00.000Z");
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid start date." };
    }
    startDate = d;
  }

  const model = await prisma.deviceModel.findFirst({
    where: { id: deviceModelId, isActive: true },
    select: { id: true },
  });
  if (!model) {
    return { error: "That device model was not found or is inactive." };
  }

  if (simCardId) {
    const sim = await prisma.simCard.findFirst({
      where: { id: simCardId },
      select: { id: true, device: { select: { id: true } } },
    });
    if (!sim) {
      return { error: "Selected SIM was not found." };
    }
    if (sim.device) {
      return { error: "That SIM is already linked to another device." };
    }
  }

  if (customerId) {
    const cust = await prisma.customer.findFirst({
      where: { id: customerId },
      select: { id: true },
    });
    if (!cust) {
      return { error: "Selected customer was not found." };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const status = customerId ? "assigned" : "in_stock";

      const device = await tx.device.create({
        data: {
          imei,
          serialNumber,
          label,
          condition,
          firmwareVersion,
          notes,
          usagePurpose,
          tags,
          deviceModelId,
          status,
          simCardId,
        },
      });

      if (customerId && startDate) {
        await tx.serviceAssignment.create({
          data: {
            customerId,
            deviceId: device.id,
            startDate,
            status: "active",
            simCardId,
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That IMEI is already registered." };
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      return { error: "That IMEI is already registered." };
    }
    return { error: msg || "Could not register device." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/devices");
  redirect("/admin/devices");
}

export async function updateDeviceCommercialFields(
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

  const usagePurpose = parseDeviceUsagePurpose(String(formData.get("usagePurpose") ?? ""));
  const tags = parseDeviceTagsInput(String(formData.get("tags") ?? ""));

  try {
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { usagePurpose, tags },
      select: { id: true, simCardId: true },
    });
    if (updated.simCardId) {
      revalidatePath(`/admin/sims/${updated.simCardId}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Could not update device." };
  }

  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${deviceId}/edit`);
  revalidatePath("/admin/sims");
  return { error: null };
}
