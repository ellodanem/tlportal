"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { normalizeWhatsAppPhone } from "@/lib/twilio/phone";
import {
  assertCanonicalSubscriptionOnboardingAllowed,
  canonicalSubscriptionUiVisible,
  canonicalSubscriptionUiAccess,
  CanonicalSubscriptionUiError,
} from "@/lib/domain/canonical-subscription-admin";
import { CanonicalSubscriptionValidationError } from "@/lib/domain/canonical-subscription-application";
import {
  addBillableServiceToSubscription,
  createCanonicalOnboarding,
  createDraftCanonicalSubscription,
  scheduleSubscriptionItemEnd,
  scheduleSubscriptionItemRate,
  updateDraftSubscriptionItemCommercialDetails,
} from "@/lib/services/canonical-subscription-application-service";

export type CanonicalSubscriptionFormState = {
  error?: string;
  message?: string;
  next?: string;
};

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

function actionError(error: unknown): CanonicalSubscriptionFormState {
  if (
    error instanceof CanonicalSubscriptionValidationError
    || error instanceof CanonicalSubscriptionUiError
  ) {
    return { error: error.message };
  }
  return { error: error instanceof Error ? error.message : "The draft could not be updated." };
}

async function requireStaff() {
  if (!canonicalSubscriptionUiVisible()) throw new CanonicalSubscriptionUiError("FEATURE_DISABLED", "Canonical onboarding is unavailable.");
  const session = await getSession();
  if (!session) throw new CanonicalSubscriptionUiError("UNAUTHORIZED", "You must be signed in.");
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true } });
  if (!user) throw new CanonicalSubscriptionUiError("UNAUTHORIZED", "A staff account is required.");
  return session;
}

async function requireEditableDraft(subscriptionId: string) {
  const session = await requireStaff();
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      controlMode: true,
      lifecycleStatus: true,
      canonicalMigrationLedger: { select: { id: true } },
    },
  });
  if (!subscription) {
    throw new CanonicalSubscriptionUiError("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  }
  assertCanonicalSubscriptionOnboardingAllowed({
    authenticated: true,
    access: canonicalSubscriptionUiAccess({
      controlMode: subscription.controlMode,
      lifecycleStatus: subscription.lifecycleStatus,
      hasMigrationLedger: Boolean(subscription.canonicalMigrationLedger),
    }),
    controlMode: subscription.controlMode,
  });
  return session;
}

async function requireEditableDraftItem(subscriptionId: string, subscriptionItemId: string) {
  const session = await requireEditableDraft(subscriptionId);
  const item = await prisma.subscriptionItem.findUnique({
    where: { id: subscriptionItemId },
    select: { customerSubscriptionId: true },
  });
  if (!item || item.customerSubscriptionId !== subscriptionId) {
    throw new CanonicalSubscriptionUiError(
      "ITEM_SUBSCRIPTION_MISMATCH",
      "The draft service does not belong to this subscription.",
    );
  }
  return session;
}

export async function createCanonicalDraftAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  try {
    const session = await requireStaff();
    if (process.env.NODE_ENV === "production") {
      return { error: "Use canonical customer onboarding for new production subscriptions." };
    }
    const interval = Number(text(formData, "billingIntervalMonths"));
    const defaultAmount = text(formData, "defaultAgreedAmountPerCycle");
    const initialLabel = optionalText(formData, "initialItemLabel");
    const initialAmount = optionalText(formData, "initialItemAmount");
    const nextBillingDate = text(formData, "nextBillingDate");
    const initialActivationDate = optionalText(formData, "initialActivationDate");
    const subscription = await createDraftCanonicalSubscription({
      customerId: text(formData, "customerId"),
      name: text(formData, "name"),
      reference: optionalText(formData, "reference"),
      billingIntervalMonths: interval,
      collectionMethod: text(formData, "collectionMethod") as "manual_invoice" | "stripe_autocharge",
      currency: "XCD",
      defaultAgreedAmountPerCycle: defaultAmount,
      commercialStartDate: text(formData, "commercialStartDate"),
      billingAnchorDate: text(formData, "billingAnchorDate"),
      nextBillingDate,
      items: initialLabel ? [{
        label: initialLabel,
        serviceActivatedDate: initialActivationDate,
        billingEffectiveFrom: nextBillingDate,
        agreedAmountPerCycle: initialAmount ?? defaultAmount,
        rateClassification: initialAmount && initialAmount !== defaultAmount ? "negotiated" : "standard",
        rateChangeReason: initialAmount && initialAmount !== defaultAmount ? "Initial negotiated draft rate" : null,
        createdById: session.sub,
      }] : [],
    });
    revalidatePath("/admin/subscriptions/canonical");
    return {
      message: "Shadow draft created. No billing or provider operation was started.",
      next: `/admin/subscriptions/canonical/${subscription.id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createCanonicalOnboardingAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  try {
    await requireStaff();
    const customerMode = text(formData, "customerMode");
    const rawPhone = optionalText(formData, "newCustomerPhone");
    const phone = rawPhone ? normalizeWhatsAppPhone(rawPhone) : null;
    if (rawPhone && !phone) return { error: "Enter the new customer phone with a valid country code." };

    const labels = formData.getAll("serviceLabel").map((value) => String(value).trim());
    const amounts = formData.getAll("serviceAmount").map((value) => String(value).trim());
    const classifications = formData.getAll("serviceClassification").map((value) => String(value));
    const deviceIds = formData.getAll("serviceDeviceId").map((value) => String(value).trim());
    if (!labels.length || labels.some((label) => !label)) return { error: "Every tracking service needs a label." };
    if (amounts.length !== labels.length || amounts.some((amount) => !amount)) return { error: "Every tracking service needs an explicit cycle price." };

    const result = await createCanonicalOnboarding({
      customer: customerMode === "existing" ? {
        existingCustomerId: text(formData, "customerId"),
      } : {
        firstName: optionalText(formData, "newCustomerFirstName"),
        lastName: optionalText(formData, "newCustomerLastName"),
        company: optionalText(formData, "newCustomerCompany"),
        email: optionalText(formData, "newCustomerEmail"),
        phone,
        address: optionalText(formData, "newCustomerAddress"),
        city: optionalText(formData, "newCustomerCity"),
        country: optionalText(formData, "newCustomerCountry"),
        invoiceCc: optionalText(formData, "newCustomerInvoiceCc"),
        invoiceBcc: optionalText(formData, "newCustomerInvoiceBcc"),
        notes: optionalText(formData, "newCustomerNotes"),
      },
      name: text(formData, "name"),
      reference: optionalText(formData, "reference"),
      billingIntervalMonths: Number(text(formData, "billingIntervalMonths")),
      collectionMethod: text(formData, "collectionMethod") as "manual_invoice" | "stripe_autocharge",
      currency: text(formData, "currency") || "XCD",
      defaultAgreedAmountPerCycle: amounts[0],
      commercialStartDate: text(formData, "commercialStartDate"),
      billingAnchorDate: text(formData, "billingAnchorDate"),
      nextBillingDate: text(formData, "nextBillingDate"),
      gracePeriodDays: Number(text(formData, "gracePeriodDays") || "7"),
      items: labels.map((label, index) => ({
        label,
        agreedAmountPerCycle: amounts[index],
        rateClassification: classifications[index] === "negotiated" ? "negotiated" : "standard",
        rateChangeReason: classifications[index] === "negotiated" ? "Initial negotiated onboarding rate" : "Initial onboarding rate",
        deviceId: deviceIds[index] || null,
      })),
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${result.customerId}`);
    revalidatePath("/admin/devices");
    revalidatePath("/admin/subscriptions/canonical");
    return {
      message: "Canonical customer onboarding draft created. Billing remains inactive until a later explicit activation.",
      next: `/admin/subscriptions/canonical/${result.subscription.id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function addCanonicalDraftItemAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const session = await requireEditableDraft(subscriptionId);
    await addBillableServiceToSubscription(subscriptionId, {
      label: text(formData, "label"),
      notes: optionalText(formData, "notes"),
      serviceActivatedDate: optionalText(formData, "serviceActivatedDate"),
      billingEffectiveFrom: optionalText(formData, "billingEffectiveFrom"),
      billingEffectiveUntil: optionalText(formData, "billingEffectiveUntil"),
      agreedAmountPerCycle: optionalText(formData, "agreedAmountPerCycle"),
      rateClassification: text(formData, "classification") === "negotiated" ? "negotiated" : "standard",
      rateChangeReason: optionalText(formData, "changeReason"),
      createdById: session.sub,
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Draft service added." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCanonicalDraftItemAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const subscriptionItemId = text(formData, "subscriptionItemId");
    await requireEditableDraftItem(subscriptionId, subscriptionItemId);
    await updateDraftSubscriptionItemCommercialDetails({
      subscriptionItemId,
      label: text(formData, "label"),
      notes: optionalText(formData, "notes"),
      serviceActivatedDate: optionalText(formData, "serviceActivatedDate"),
      billingEffectiveFrom: optionalText(formData, "billingEffectiveFrom"),
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    return { message: "Draft service details updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function scheduleCanonicalDraftRateAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const subscriptionItemId = text(formData, "subscriptionItemId");
    const session = await requireEditableDraftItem(subscriptionId, subscriptionItemId);
    await scheduleSubscriptionItemRate({
      subscriptionItemId,
      agreedAmountPerCycle: text(formData, "agreedAmountPerCycle"),
      effectiveFrom: text(formData, "effectiveFrom"),
      effectiveUntil: optionalText(formData, "effectiveUntil"),
      classification: text(formData, "classification") === "standard" ? "standard" : "negotiated",
      changeReason: optionalText(formData, "changeReason"),
      createdById: session.sub,
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Rate change scheduled. This is a preview configuration only." };
  } catch (error) {
    return actionError(error);
  }
}

export async function scheduleCanonicalDraftItemEndAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const subscriptionItemId = text(formData, "subscriptionItemId");
    await requireEditableDraftItem(subscriptionId, subscriptionItemId);
    await scheduleSubscriptionItemEnd({
      subscriptionItemId,
      effectiveUntil: text(formData, "effectiveUntil"),
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Draft service end date scheduled." };
  } catch (error) {
    return actionError(error);
  }
}
