"use server";

import { prisma } from "@/lib/db";

import type { RegisterFormState } from "./register-form-state";

export async function submitRegistrationRequest(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const emailStored = emailRaw;
  const vehicleDetails = String(formData.get("vehicleDetails") ?? "").trim();
  const subscriptionOptionId = String(formData.get("subscriptionOptionId") ?? "").trim() || null;

  const termInstall = formData.get("termInstallAfterPayment") === "on" || formData.get("termInstallAfterPayment") === "true";
  const termHardware = formData.get("termHardwarePerVehicle") === "on" || formData.get("termHardwarePerVehicle") === "true";
  const termTravel = formData.get("termTravelFee") === "on" || formData.get("termTravelFee") === "true";

  if (!firstName || !lastName) {
    return { ok: false, error: "First and last name are required." };
  }
  if (!phone) {
    return { ok: false, error: "WhatsApp phone number is required." };
  }
  if (!emailStored.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!vehicleDetails) {
    return { ok: false, error: "Vehicle details are required." };
  }
  if (!termInstall || !termHardware || !termTravel) {
    return { ok: false, error: "Please confirm all three terms to continue." };
  }

  if (subscriptionOptionId) {
    const opt = await prisma.subscriptionOption.findFirst({
      where: { id: subscriptionOptionId, isActive: true },
      select: { id: true },
    });
    if (!opt) {
      return { ok: false, error: "Selected subscription option is no longer available." };
    }
  }

  const matchingCustomer = await prisma.customer.findFirst({
    where: { email: { equals: emailStored, mode: "insensitive" } },
    select: { id: true },
  });

  const otherPending = await prisma.registrationRequest.count({
    where: {
      status: "pending",
      email: { equals: emailStored, mode: "insensitive" },
    },
  });

  try {
    await prisma.registrationRequest.create({
      data: {
        firstName,
        lastName,
        phone,
        email: emailStored,
        vehicleDetails,
        subscriptionOptionId,
        termInstallAfterPayment: termInstall,
        termHardwarePerVehicle: termHardware,
        termTravelFee: termTravel,
        matchesCustomerId: matchingCustomer?.id ?? null,
        otherPendingSameEmail: otherPending,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not submit registration.";
    return { ok: false, error: message };
  }

  return {
    ok: true,
    message: "Thanks — your registration was received. Our team will review it and contact you.",
  };
}
