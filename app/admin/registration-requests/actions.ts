"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { buildRegistrationCustomerNotes } from "@/lib/register/build-registration-notes";
import { prisma } from "@/lib/db";
import { formatSubscriptionChoiceLabel } from "@/lib/subscription-options/display";

import type { RegistrationReviewState } from "./registration-review-state";

export async function approveRegistrationRequest(
  _prev: RegistrationReviewState,
  formData: FormData,
): Promise<RegistrationReviewState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in.", next: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing registration id.", next: null };
  }

  const reg = await prisma.registrationRequest.findUnique({
    where: { id },
    include: { subscriptionOption: { select: { durationMonths: true, priceXcd: true } } },
  });
  if (!reg) {
    return { error: "Registration not found.", next: null };
  }
  if (reg.status !== "pending") {
    return { error: "This registration is no longer pending.", next: null };
  }

  if (reg.matchesCustomerId) {
    return {
      error:
        "This submission was flagged: the email already matches an existing customer. Reject it or update the existing customer instead of approving a duplicate.",
      next: null,
    };
  }

  const clash = await prisma.customer.findFirst({
    where: { email: { equals: reg.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) {
    return {
      error: "A customer with this email already exists. Cannot create another. Reject this registration or merge manually.",
      next: null,
    };
  }

  const notes = buildRegistrationCustomerNotes({
    submittedAt: reg.submittedAt,
    vehicleDetails: reg.vehicleDetails,
    subscriptionLabel:
      reg.subscriptionOption != null
        ? formatSubscriptionChoiceLabel(
            reg.subscriptionOption.durationMonths,
            reg.subscriptionOption.priceXcd,
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
    return { error: message, next: null };
  }

  revalidatePath("/admin/registration-requests");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}/edit`);
  return {
    error: null,
    next: `/admin/customers/${customerId}/edit`,
  };
}

export async function rejectRegistrationRequest(
  _prev: RegistrationReviewState,
  formData: FormData,
): Promise<RegistrationReviewState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in.", next: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("rejectionReason") ?? "").trim();
  if (!id) {
    return { error: "Missing registration id.", next: null };
  }
  if (!reason) {
    return { error: "Enter a rejection reason for the record.", next: null };
  }

  const reg = await prisma.registrationRequest.findUnique({ where: { id } });
  if (!reg) {
    return { error: "Registration not found.", next: null };
  }
  if (reg.status !== "pending") {
    return { error: "This registration is no longer pending.", next: null };
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
    return { error: message, next: null };
  }

  revalidatePath("/admin/registration-requests");
  revalidatePath(`/admin/registration-requests/${id}`);
  return { error: null, next: "/admin/registration-requests" };
}
