"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

import type { DeviceModelFormActionState } from "./device-model-form-state";

function parseOptionalString(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v.length ? v : null;
}

function parseMoney(raw: string, label: string): Prisma.Decimal {
  const t = raw.trim();
  if (!t) {
    throw new Error(`${label} is required.`);
  }
  const n = Number(t);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`${label} must be a number zero or greater.`);
  }
  return new Prisma.Decimal(n.toFixed(2));
}

function parseOptionalMoney(raw: string): Prisma.Decimal | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n) || n < 0) {
    throw new Error("Cost price must be a valid number zero or greater.");
  }
  return new Prisma.Decimal(n.toFixed(2));
}

export async function createDeviceModel(
  _prev: DeviceModelFormActionState,
  formData: FormData,
): Promise<DeviceModelFormActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Name is required." };
  }

  let retailPrice: Prisma.Decimal;
  let costPrice: Prisma.Decimal | null;
  try {
    retailPrice = parseMoney(String(formData.get("retailPrice") ?? ""), "Retail price");
    costPrice = parseOptionalMoney(String(formData.get("costPrice") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid price." };
  }

  const isActive = String(formData.get("isActive") ?? "") === "on";

  try {
    await prisma.deviceModel.create({
      data: {
        name,
        manufacturer: parseOptionalString(formData, "manufacturer"),
        category: parseOptionalString(formData, "category"),
        description: parseOptionalString(formData, "description"),
        retailPrice,
        costPrice,
        isActive,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create device model.";
    return { error: msg };
  }

  revalidatePath("/admin/device-models");
  revalidatePath("/admin/devices/new");
  redirect("/admin/device-models");
}

export async function updateDeviceModel(
  _prev: DeviceModelFormActionState,
  formData: FormData,
): Promise<DeviceModelFormActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing device model id." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Name is required." };
  }

  let retailPrice: Prisma.Decimal;
  let costPrice: Prisma.Decimal | null;
  try {
    retailPrice = parseMoney(String(formData.get("retailPrice") ?? ""), "Retail price");
    costPrice = parseOptionalMoney(String(formData.get("costPrice") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid price." };
  }

  const isActive = String(formData.get("isActive") ?? "") === "on";

  try {
    await prisma.deviceModel.update({
      where: { id },
      data: {
        name,
        manufacturer: parseOptionalString(formData, "manufacturer"),
        category: parseOptionalString(formData, "category"),
        description: parseOptionalString(formData, "description"),
        retailPrice,
        costPrice,
        isActive,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update device model.";
    return { error: msg };
  }

  revalidatePath("/admin/device-models");
  revalidatePath("/admin/devices/new");
  redirect("/admin/device-models");
}
