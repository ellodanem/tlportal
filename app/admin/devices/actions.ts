"use server";

import { DeviceCondition, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { parseDeviceObjectType } from "@/lib/admin/device-object-type";
import { parseDeviceTagsInput, parseDeviceUsagePurpose } from "@/lib/admin/device-usage-purpose";
import { prisma } from "@/lib/db";

import type { DeviceFormActionState } from "./device-form-state";

const CONDITIONS = new Set<string>(["new", "refurbished", "faulty"]);

async function simLinkErrorForNewDevice(simCardId: string): Promise<string | null> {
  const sim = await prisma.simCard.findFirst({
    where: { id: simCardId },
    select: { id: true, device: { select: { id: true } } },
  });
  if (!sim) {
    return "Selected SIM was not found.";
  }
  if (sim.device) {
    return "That SIM is already linked to another device.";
  }
  const openAssignment = await prisma.serviceAssignment.findFirst({
    where: {
      simCardId,
      endDate: null,
      status: { not: "cancelled" },
    },
    select: { id: true },
  });
  if (openAssignment) {
    return "That SIM is tied to an active service assignment.";
  }
  return null;
}

async function simLinkErrorForExistingDevice(deviceId: string, simCardId: string): Promise<string | null> {
  const sim = await prisma.simCard.findFirst({
    where: { id: simCardId },
    select: { id: true, device: { select: { id: true } } },
  });
  if (!sim) {
    return "Selected SIM was not found.";
  }
  if (sim.device && sim.device.id !== deviceId) {
    return "That SIM is already linked to another device.";
  }
  const otherAssignment = await prisma.serviceAssignment.findFirst({
    where: {
      simCardId,
      endDate: null,
      status: { not: "cancelled" },
      deviceId: { not: deviceId },
    },
    select: { id: true },
  });
  if (otherAssignment) {
    return "That SIM is tied to another active service assignment.";
  }
  return null;
}

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
  const objectType = parseDeviceObjectType(String(formData.get("objectType") ?? ""));
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
    const simErr = await simLinkErrorForNewDevice(simCardId);
    if (simErr) {
      return { error: simErr };
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
          objectType,
          tags,
          deviceModelId,
          status,
          simCardId,
        },
      });

      if (customerId) {
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
  const objectType = parseDeviceObjectType(String(formData.get("objectType") ?? ""));
  const tags = parseDeviceTagsInput(String(formData.get("tags") ?? ""));

  try {
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { usagePurpose, objectType, tags },
      select: { id: true, simCardId: true },
    });
    if (updated.simCardId) {
      revalidatePath(`/admin/sims/${updated.simCardId}`);
    }
    const assignmentCustomers = await prisma.serviceAssignment.findMany({
      where: {
        deviceId,
        endDate: null,
        status: { not: "cancelled" },
      },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    for (const row of assignmentCustomers) {
      revalidatePath(`/admin/customers/${row.customerId}`);
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

/**
 * Create an active service assignment for an existing in-stock (or unassigned) device.
 */
export async function assignDeviceToCustomer(
  _prev: DeviceFormActionState,
  formData: FormData,
): Promise<DeviceFormActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const deviceId = String(formData.get("deviceId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "").trim();

  if (!deviceId) {
    return { error: "Missing device id." };
  }
  if (!customerId) {
    return { error: "Select a customer." };
  }

  let startDate: Date | null = null;
  if (startDateRaw) {
    const d = new Date(startDateRaw + "T12:00:00.000Z");
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid start date." };
    }
    startDate = d;
  }

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true, status: true, simCardId: true },
  });
  if (!device) {
    return { error: "Device not found." };
  }
  if (device.status === "decommissioned" || device.status === "lost") {
    return { error: "Cannot assign a decommissioned or lost device." };
  }

  const existingOpen = await prisma.serviceAssignment.findFirst({
    where: {
      deviceId,
      endDate: null,
      status: { not: "cancelled" },
    },
    select: { id: true },
  });
  if (existingOpen) {
    return { error: "This device already has an active service assignment." };
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) {
    return { error: "Selected customer was not found." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.serviceAssignment.create({
        data: {
          customerId,
          deviceId,
          startDate,
          status: "active",
          simCardId: device.simCardId,
        },
      });
      await tx.device.update({
        where: { id: deviceId },
        data: { status: "assigned" },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Could not assign device." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${deviceId}/edit`);
  revalidatePath(`/admin/customers/${customerId}`);
  if (device.simCardId) {
    revalidatePath(`/admin/sims/${device.simCardId}`);
  }
  redirect(`/admin/devices/${deviceId}/edit`);
}

export async function updateServiceAssignmentDates(
  _prev: DeviceFormActionState,
  formData: FormData,
): Promise<DeviceFormActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const deviceId = String(formData.get("deviceId") ?? "").trim();
  const startRaw = String(formData.get("startDate") ?? "").trim();
  const nextDueRaw = String(formData.get("nextDueDate") ?? "").trim();
  const invoilessRecurringIdRaw = String(formData.get("invoilessRecurringId") ?? "").trim();
  const invoilessRecurringId = invoilessRecurringIdRaw.length ? invoilessRecurringIdRaw : null;

  if (!assignmentId || !deviceId) {
    return { error: "Missing assignment or device." };
  }

  let startDate: Date | null = null;
  if (startRaw) {
    const d = new Date(startRaw + "T12:00:00.000Z");
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid start date." };
    }
    startDate = d;
  }

  let nextDueDate: Date | null = null;
  if (nextDueRaw) {
    const d = new Date(nextDueRaw + "T12:00:00.000Z");
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid next due date." };
    }
    nextDueDate = d;
  }

  const assignment = await prisma.serviceAssignment.findFirst({
    where: {
      id: assignmentId,
      deviceId,
      endDate: null,
      status: { not: "cancelled" },
    },
    select: { id: true, customerId: true },
  });
  if (!assignment) {
    return { error: "Active assignment not found for this device." };
  }

  try {
    await prisma.serviceAssignment.update({
      where: { id: assignmentId },
      data: { startDate, nextDueDate, invoilessRecurringId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Could not update assignment." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${deviceId}/edit`);
  revalidatePath(`/admin/customers/${assignment.customerId}`);
  redirect(`/admin/devices/${deviceId}/edit`);
}

/**
 * End the active service assignment and return the device to in-stock (e.g. removal / relocation).
 */
export async function unassignDeviceFromCustomer(
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

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true, status: true, simCardId: true },
  });
  if (!device) {
    return { error: "Device not found." };
  }
  if (device.status === "decommissioned" || device.status === "lost") {
    return { error: "Cannot unassign a decommissioned or lost device." };
  }

  const assignment = await prisma.serviceAssignment.findFirst({
    where: {
      deviceId,
      endDate: null,
      status: { not: "cancelled" },
    },
    select: { id: true, customerId: true },
  });
  if (!assignment) {
    return { error: "This device has no active assignment to end." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.serviceAssignment.update({
        where: { id: assignment.id },
        data: {
          endDate: new Date(),
          status: "cancelled",
        },
      });
      await tx.device.update({
        where: { id: deviceId },
        data: { status: "in_stock" },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Could not unassign device." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${deviceId}/edit`);
  revalidatePath(`/admin/customers/${assignment.customerId}`);
  if (device.simCardId) {
    revalidatePath(`/admin/sims/${device.simCardId}`);
  }
  redirect(`/admin/devices/${deviceId}/edit`);
}

function deviceBlockedForSimEdit(status: string): boolean {
  return status === "decommissioned" || status === "lost";
}

/**
 * Remove the SIM link from a device (and from its active service assignment, if any).
 */
export async function clearDeviceSimCard(
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

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true, status: true, simCardId: true },
  });
  if (!device) {
    return { error: "Device not found." };
  }
  if (deviceBlockedForSimEdit(device.status)) {
    return { error: "Cannot change SIM on a decommissioned or lost device." };
  }
  if (!device.simCardId) {
    return { error: "This device has no linked SIM to remove." };
  }

  const prevSimId = device.simCardId;

  const assignment = await prisma.serviceAssignment.findFirst({
    where: {
      deviceId,
      endDate: null,
      status: { not: "cancelled" },
    },
    select: { id: true, customerId: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: { simCardId: null },
      });
      if (assignment) {
        await tx.serviceAssignment.update({
          where: { id: assignment.id },
          data: { simCardId: null },
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Could not remove SIM link." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${deviceId}/edit`);
  revalidatePath("/admin/sims");
  revalidatePath(`/admin/sims/${prevSimId}`);
  if (assignment) {
    revalidatePath(`/admin/customers/${assignment.customerId}`);
  }
  redirect(`/admin/devices/${deviceId}/edit`);
}

/**
 * Link or swap the SIM on a device; updates the active service assignment to match when present.
 */
export async function updateDeviceLinkedSim(
  _prev: DeviceFormActionState,
  formData: FormData,
): Promise<DeviceFormActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const deviceId = String(formData.get("deviceId") ?? "").trim();
  const simCardIdRaw = String(formData.get("simCardId") ?? "").trim();
  if (!deviceId) {
    return { error: "Missing device id." };
  }
  if (!simCardIdRaw) {
    return {
      error: "Select a SIM from the list, or use Remove SIM to unlink the current card.",
    };
  }

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true, status: true, simCardId: true },
  });
  if (!device) {
    return { error: "Device not found." };
  }
  if (deviceBlockedForSimEdit(device.status)) {
    return { error: "Cannot change SIM on a decommissioned or lost device." };
  }

  const simErr = await simLinkErrorForExistingDevice(deviceId, simCardIdRaw);
  if (simErr) {
    return { error: simErr };
  }

  if (device.simCardId === simCardIdRaw) {
    redirect(`/admin/devices/${deviceId}/edit`);
  }

  const prevSimId = device.simCardId;
  const assignment = await prisma.serviceAssignment.findFirst({
    where: {
      deviceId,
      endDate: null,
      status: { not: "cancelled" },
    },
    select: { id: true, customerId: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: { simCardId: simCardIdRaw },
      });
      if (assignment) {
        await tx.serviceAssignment.update({
          where: { id: assignment.id },
          data: { simCardId: simCardIdRaw },
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "Could not update linked SIM." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${deviceId}/edit`);
  revalidatePath("/admin/sims");
  if (prevSimId) {
    revalidatePath(`/admin/sims/${prevSimId}`);
  }
  revalidatePath(`/admin/sims/${simCardIdRaw}`);
  if (assignment) {
    revalidatePath(`/admin/customers/${assignment.customerId}`);
  }
  redirect(`/admin/devices/${deviceId}/edit`);
}
