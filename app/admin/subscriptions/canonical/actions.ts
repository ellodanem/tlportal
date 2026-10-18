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
  updateDraftSubscriptionCollectionMethod,
  updateDraftSubscriptionItemCommercialDetails,
} from "@/lib/services/canonical-subscription-application-service";
import { activateCanonicalManualSubscription } from "@/lib/services/canonical-subscription-activation-service";
import { CanonicalSubscriptionActivationError } from "@/lib/domain/canonical-subscription-activation";

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

function utcDate(formData: FormData, name: string): Date | null {
  const value = optionalText(formData, name);
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new CanonicalSubscriptionValidationError("INVALID_DATE", `${name} must be a valid calendar date.`);
  return parsed;
}

function actionError(error: unknown): CanonicalSubscriptionFormState {
  if (
    error instanceof CanonicalSubscriptionValidationError
    || error instanceof CanonicalSubscriptionUiError
    || error instanceof CanonicalSubscriptionActivationError
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

export async function activateCanonicalManualSubscriptionAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const session = await requireEditableDraft(subscriptionId);
    if (["confirmCommercial", "confirmHardware", "confirmInitialBilling"].some((name) => text(formData, name) !== "yes")) {
      return { error: "Confirm the commercial terms, assigned hardware, and initial billing decision before activation." };
    }
    const descriptions = formData.getAll("initialChargeDescription").map((value) => String(value).trim());
    const quantities = formData.getAll("initialChargeQuantity").map((value) => String(value).trim());
    const prices = formData.getAll("initialChargeUnitPrice").map((value) => String(value).trim());
    if (quantities.length !== descriptions.length || prices.length !== descriptions.length) {
      return { error: "Initial charge rows are incomplete." };
    }
    const initialCharges = descriptions.flatMap((description, index) => {
      const quantity = quantities[index];
      const unitPrice = prices[index];
      if (!description && !quantity && !unitPrice) return [];
      return [{ description, quantity: Number(quantity), unitPrice: Number(unitPrice) }];
    });
    const mode = text(formData, "initialBillingMode") === "advance_invoice" ? "advance_invoice" : "deferred";
    const result = await activateCanonicalManualSubscription({
      subscriptionId,
      staffUserId: session.sub,
      confirmationNote: text(formData, "confirmationNote"),
      initialBilling: {
        mode,
        periodStart: utcDate(formData, "initialPeriodStart"),
        periodEnd: utcDate(formData, "initialPeriodEnd"),
        issueDate: utcDate(formData, "initialInvoiceIssueDate"),
        dueDaysAfterIssue: mode === "advance_invoice" ? Number(text(formData, "initialInvoiceDueDays")) : null,
        oneTimeCharges: initialCharges,
      },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: result.reused
      ? "Existing operational activation was retained; no duplicate invoice or schedule was created."
      : result.initialInvoiceId
        ? "Subscription activated and the approved initial invoice was created. No payment or customer notification was recorded."
        : "Subscription activated with an explicitly deferred first invoice. No payment or customer notification was recorded." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCanonicalDraftCollectionMethodAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    await requireEditableDraft(subscriptionId);
    const collectionMethod = text(formData, "collectionMethod");
    if (collectionMethod !== "manual_invoice" && collectionMethod !== "stripe_autocharge") {
      return { error: "Choose manual invoice or Stripe autocharge." };
    }
    await updateDraftSubscriptionCollectionMethod(subscriptionId, collectionMethod);
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Collection method saved. No provider, invoice, or payment operation was started." };
  } catch (error) {
    return actionError(error);
  }
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
