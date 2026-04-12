"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { buildRegistrationCustomerNotes } from "@/lib/register/build-registration-notes";
import { prisma } from "@/lib/db";
import { formatSubscriptionChoiceLabel } from "@/lib/subscription-options/display";

export type RegistrationReviewState = { error: string | null };

export const registrationReviewInitialState: RegistrationReviewState = { error: null };

export async function approveRegistrationRequest(
  _prev: RegistrationReviewState,
  formData: FormData,
): Promise<RegistrationReviewState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing registration id." };
  }

  const reg = await prisma.registrationRequest.findUnique({
    where: { id },
    include: { subscriptionOption: { select: { durationMonths: true, priceUsd: true } } },
  });
  if (!reg) {
    return { error: "Registration not found." };
  }
  if (reg.status !== "pending") {
    return { error: "This registration is no longer pending." };
  }

  if (reg.matchesCustomerId) {
    return {
      error:
        "This submission was flagged: the email already matches an existing customer. Reject it or update the existing customer instead of approving a duplicate.",
    };
  }

  const clash = await prisma.customer.findFirst({
    where: { email: { equals: reg.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) {
    return {
      error: "A customer with this email already exists. Cannot create another. Reject this registration or merge manually.",
    };
  }

  const notes = buildRegistrationCustomerNotes({
    submittedAt: reg.submittedAt,
    vehicleDetails: reg.vehicleDetails,
    subscriptionLabel:
      reg.subscriptionOption != null
        ? formatSubscriptionChoiceLabel(
            reg.subscriptionOption.durationMonths,
            reg.subscriptionOption.priceUsd,
          )
        : null,
    termInstallAfterPayment: reg.termInstallAfterPayment,
    termHardwarePerVehicle: reg.termHardwarePerVehicle,
    termTravelFee: reg.termTravelFee,
  });

  let customerId: string;
  try {
    customerId = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          firstName: reg.firstName,
          lastName: reg.lastName,
          email: reg.email,
          phone: reg.phone,
          notes,
          tags: ["from-registration"],
        },
      });
      await tx.registrationRequest.update({
        where: { id },
        data: {
          status: "approved",
          createdCustomerId: customer.id,
          reviewedAt: new Date(),
          reviewedById: session.sub,
          rejectionReason: null,
        },
      });
      return customer.id;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not approve registration.";
    return { error: message };
  }

  revalidatePath("/admin/registration-requests");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}/edit`);
  redirect(`/admin/customers/${customerId}/edit`);
}

export async function rejectRegistrationRequest(
  _prev: RegistrationReviewState,
  formData: FormData,
): Promise<RegistrationReviewState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("rejectionReason") ?? "").trim();
  if (!id) {
    return { error: "Missing registration id." };
  }
  if (!reason) {
    return { error: "Enter a rejection reason for the record." };
  }

  const reg = await prisma.registrationRequest.findUnique({ where: { id } });
  if (!reg) {
    return { error: "Registration not found." };
  }
  if (reg.status !== "pending") {
    return { error: "This registration is no longer pending." };
  }

  try {
    await prisma.registrationRequest.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedById: session.sub,
        rejectionReason: reason,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not reject registration.";
    return { error: message };
  }

  revalidatePath("/admin/registration-requests");
  revalidatePath(`/admin/registration-requests/${id}`);
  redirect("/admin/registration-requests");
}
