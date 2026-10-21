"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { normalizeWhatsAppPhone } from "@/lib/twilio/phone";
import {
  assertCanonicalSubscriptionOnboardingAllowed,
  assertCanonicalSubscriptionManagementAllowed,
  canonicalSubscriptionUiVisible,
  canonicalSubscriptionUiAccess,
  CanonicalSubscriptionUiError,
} from "@/lib/domain/canonical-subscription-admin";
import {
  parseServicePauseDisposition,
  parseServicePauseReason,
} from "@/lib/domain/service-pause";
import { CanonicalSubscriptionValidationError } from "@/lib/domain/canonical-subscription-application";
import {
  addBillableServiceToSubscription,
  createCanonicalOnboarding,
  createDraftCanonicalSubscription,
  scheduleSubscriptionItemEnd,
  scheduleSubscriptionItemRate,
  replaceSubscriptionItemHardware,
  transferSubscriptionItem,
  transitionCanonicalSubscriptionLifecycle,
  updateDraftSubscriptionCollectionMethod,
  updateDraftSubscriptionItemCommercialDetails,
} from "@/lib/services/canonical-subscription-application-service";
import { activateCanonicalManualSubscription } from "@/lib/services/canonical-subscription-activation-service";
import { CanonicalSubscriptionActivationError } from "@/lib/domain/canonical-subscription-activation";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { pauseServiceAssignment } from "@/lib/services/service-pause-service";
import { adoptExistingStripeSubscription, CanonicalStripeAdoptionError } from "@/lib/services/canonical-stripe-adoption-service";

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
    || error instanceof CanonicalStripeAdoptionError
  ) {
    return { error: error.message };
  }
  return { error: error instanceof Error ? error.message : "The draft could not be updated." };
}

async function requireStaff() {
  if (!canonicalSubscriptionUiVisible()) throw new CanonicalSubscriptionUiError("FEATURE_DISABLED", "Subscription onboarding is unavailable.");
  const session = await getSession();
  if (!session) throw new CanonicalSubscriptionUiError("UNAUTHORIZED", "You must be signed in.");
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true } });
  if (!user) throw new CanonicalSubscriptionUiError("UNAUTHORIZED", "A staff account is required.");
  return session;
}

export async function adoptExistingStripeSubscriptionAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    if (text(formData, "confirmExistingStripe") !== "yes") {
      return { error: "Confirm that this is a read-only reconciliation of the existing Stripe subscription." };
    }
    const session = await requireStaff();
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, customerId: true, controlMode: true, collectionMethod: true },
    });
    if (!subscription || subscription.controlMode !== "shadow" || subscription.collectionMethod !== "stripe_autocharge") {
      return { error: "Only a pending Stripe migration record can be connected to existing Stripe billing." };
    }
    const result = await adoptExistingStripeSubscription({ subscriptionId, adoptedById: session.sub });
    await recordOperationalEvent({
      category: "subscription.stripe_existing_billing_adopted",
      summary: "Existing Stripe subscription reconciled and adopted without a provider mutation.",
      customerId: subscription.customerId,
      actorUserId: session.sub,
      payload: { subscriptionId, externalSubscriptionId: result.externalSubscriptionId, mappedRateGroups: result.mappingCount },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    revalidatePath(`/admin/customers/${subscription.customerId}/subscriptions`);
    return { message: `Existing Stripe billing is connected with ${result.mappingCount} exact rate mapping${result.mappingCount === 1 ? "" : "s"}. No Stripe subscription, charge, invoice, payment, or notification was created.` };
  } catch (error) {
    return actionError(error);
  }
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

async function requireManageableCanonicalSubscription(subscriptionId: string) {
  const session = await requireStaff();
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      customerId: true,
      controlMode: true,
      lifecycleStatus: true,
      collectionMethod: true,
      canonicalMigrationLedger: { select: { id: true } },
    },
  });
  if (!subscription) throw new CanonicalSubscriptionUiError("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  assertCanonicalSubscriptionManagementAllowed({
    authenticated: true,
    access: canonicalSubscriptionUiAccess({
      controlMode: subscription.controlMode,
      lifecycleStatus: subscription.lifecycleStatus,
      hasMigrationLedger: Boolean(subscription.canonicalMigrationLedger),
    }),
    controlMode: subscription.controlMode,
  });
  return { session, subscription };
}

async function requireManageableCanonicalItem(subscriptionId: string, subscriptionItemId: string) {
  const context = await requireManageableCanonicalSubscription(subscriptionId);
  const item = await prisma.subscriptionItem.findUnique({
    where: { id: subscriptionItemId },
    select: { customerSubscriptionId: true },
  });
  if (!item || item.customerSubscriptionId !== subscriptionId) {
    throw new CanonicalSubscriptionUiError("ITEM_SUBSCRIPTION_MISMATCH", "The service does not belong to this subscription.");
  }
  return context;
}

function revalidateCanonicalServiceOperation(input: {
  subscriptionId: string;
  customerId: string;
  deviceId: string;
  simCardId: string | null;
}) {
  revalidatePath(`/admin/subscriptions/canonical/${input.subscriptionId}`);
  revalidatePath("/admin/subscriptions/canonical");
  revalidatePath(`/admin/customers/${input.customerId}`);
  revalidatePath(`/admin/customers/${input.customerId}/subscriptions`);
  revalidatePath(`/admin/customers/${input.customerId}/billing`);
  revalidatePath("/admin/devices");
  revalidatePath(`/admin/devices/${input.deviceId}/edit`);
  if (input.simCardId) revalidatePath(`/admin/sims/${input.simCardId}`);
}

function pauseBillingNotice(collectionMethod: string | null): string {
  return collectionMethod === "stripe_autocharge"
    ? " Review the linked Stripe subscription or vehicle quantity before the next charge."
    : "";
}

export async function createCanonicalDraftAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  try {
    const session = await requireStaff();
    if (process.env.NODE_ENV === "production") {
      return { error: "Use subscription onboarding for new production subscriptions." };
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
      message: "Customer onboarding draft created. Billing remains inactive until a later explicit activation.",
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
    const { session, subscription } = await requireManageableCanonicalSubscription(subscriptionId);
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
    await recordOperationalEvent({
      category: "subscription.service_added",
      summary: "Subscription service added by staff.",
      customerId: subscription.customerId,
      actorUserId: session.sub,
      payload: { subscriptionId },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Service added. It joins recurring billing on its configured effective date; no invoice or notification was created." };
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
    const { session, subscription } = await requireManageableCanonicalItem(subscriptionId, subscriptionItemId);
    await scheduleSubscriptionItemRate({
      subscriptionItemId,
      agreedAmountPerCycle: text(formData, "agreedAmountPerCycle"),
      effectiveFrom: text(formData, "effectiveFrom"),
      effectiveUntil: optionalText(formData, "effectiveUntil"),
      classification: text(formData, "classification") === "standard" ? "standard" : "negotiated",
      changeReason: optionalText(formData, "changeReason"),
      createdById: session.sub,
    });
    await recordOperationalEvent({
      category: "subscription.rate_scheduled",
      summary: "Subscription service rate change scheduled by staff.",
      customerId: subscription.customerId,
      actorUserId: session.sub,
      payload: { subscriptionId, subscriptionItemId, effectiveFrom: text(formData, "effectiveFrom") },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Rate change scheduled. Historical prices remain unchanged and future billing uses the effective-dated rate." };
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
    const { session, subscription } = await requireManageableCanonicalItem(subscriptionId, subscriptionItemId);
    await scheduleSubscriptionItemEnd({
      subscriptionItemId,
      effectiveUntil: text(formData, "effectiveUntil"),
    });
    await recordOperationalEvent({
      category: "subscription.service_end_scheduled",
      summary: "Subscription service end scheduled by staff.",
      customerId: subscription.customerId,
      actorUserId: session.sub,
      payload: { subscriptionId, subscriptionItemId, effectiveUntil: text(formData, "effectiveUntil") },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Service end scheduled. Historical financial records remain unchanged." };
  } catch (error) {
    return actionError(error);
  }
}

async function requireOpenCanonicalServiceAssignment(subscriptionItemId: string, assignmentId: string) {
  const assignment = await prisma.serviceAssignment.findFirst({
    where: { id: assignmentId, subscriptionItemId, endDate: null, status: { not: "cancelled" } },
    select: { id: true, customerId: true, deviceId: true, device: { select: { simCardId: true } } },
  });
  if (!assignment) throw new CanonicalSubscriptionUiError("ASSIGNMENT_ITEM_MISMATCH", "The tracker assignment is no longer open for this subscription service.");
  return assignment;
}

export async function pauseCanonicalServiceAssignmentAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const subscriptionItemId = text(formData, "subscriptionItemId");
    const assignmentId = text(formData, "assignmentId");
    const reason = parseServicePauseReason(text(formData, "pauseReason"));
    const deviceDisposition = parseServicePauseDisposition(text(formData, "deviceDisposition"));
    if (!assignmentId) return { error: "A current tracker assignment is required." };
    if (!reason) return { error: "Select a pause reason." };
    if (!deviceDisposition) return { error: "Select a tracker disposition." };
    const { session, subscription } = await requireManageableCanonicalItem(subscriptionId, subscriptionItemId);
    const assignment = await requireOpenCanonicalServiceAssignment(subscriptionItemId, assignmentId);
    const result = await pauseServiceAssignment({ assignmentId, reason, note: optionalText(formData, "pauseNote"), deviceDisposition, actorUserId: session.sub });
    if (!result.ok) return { error: result.error };
    await recordOperationalEvent({
      category: "subscription.service_paused",
      summary: "Subscription service paused and tracker removal recorded by staff.",
      customerId: subscription.customerId,
      deviceId: assignment.deviceId,
      actorUserId: session.sub,
      payload: { subscriptionId, subscriptionItemId, assignmentId, reason, deviceDisposition },
    });
    revalidateCanonicalServiceOperation({ subscriptionId, customerId: subscription.customerId, deviceId: assignment.deviceId, simCardId: assignment.device.simCardId });
    const scheduleNote = result.pausedRecurringSchedules ? ` Paused ${result.pausedRecurringSchedules} linked recurring invoice schedule${result.pausedRecurringSchedules === 1 ? "" : "s"}.` : "";
    return { message: `Service paused and tracker marked ${deviceDisposition === "in_stock" ? "in stock" : "returned"}.${scheduleNote}${pauseBillingNotice(subscription.collectionMethod)}` };
  } catch (error) {
    return actionError(error);
  }
}

export async function removeCanonicalServiceForVehicleSaleAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const subscriptionItemId = text(formData, "subscriptionItemId");
    const assignmentId = text(formData, "assignmentId");
    const effectiveUntil = text(formData, "effectiveUntil");
    const deviceDisposition = parseServicePauseDisposition(text(formData, "deviceDisposition"));
    if (!assignmentId) return { error: "A current tracker assignment is required." };
    if (!effectiveUntil) return { error: "Choose the date on which billing ends." };
    if (!deviceDisposition) return { error: "Select a tracker disposition." };
    const { session, subscription } = await requireManageableCanonicalItem(subscriptionId, subscriptionItemId);
    const assignment = await requireOpenCanonicalServiceAssignment(subscriptionItemId, assignmentId);
    await scheduleSubscriptionItemEnd({ subscriptionItemId, effectiveUntil });
    const note = ["Vehicle sold; tracker removal.", optionalText(formData, "removalNote")].filter(Boolean).join(" ");
    const result = await pauseServiceAssignment({ assignmentId, reason: "other", note, deviceDisposition, actorUserId: session.sub });
    if (!result.ok) return { error: result.error };
    await recordOperationalEvent({
      category: "subscription.vehicle_sold_tracker_removed",
      summary: "Vehicle sold — service end scheduled and tracker removal recorded by staff.",
      customerId: subscription.customerId,
      deviceId: assignment.deviceId,
      actorUserId: session.sub,
      payload: { subscriptionId, subscriptionItemId, assignmentId, effectiveUntil, deviceDisposition, note },
    });
    revalidateCanonicalServiceOperation({ subscriptionId, customerId: subscription.customerId, deviceId: assignment.deviceId, simCardId: assignment.device.simCardId });
    const scheduleNote = result.pausedRecurringSchedules ? ` Paused ${result.pausedRecurringSchedules} linked recurring invoice schedule${result.pausedRecurringSchedules === 1 ? "" : "s"}.` : "";
    return { message: `Billing ends on ${effectiveUntil}; tracker marked ${deviceDisposition === "in_stock" ? "in stock" : "returned"}.${scheduleNote}${pauseBillingNotice(subscription.collectionMethod)}` };
  } catch (error) {
    return actionError(error);
  }
}
export async function replaceCanonicalServiceHardwareAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const subscriptionItemId = text(formData, "subscriptionItemId");
    const { session, subscription } = await requireManageableCanonicalItem(subscriptionId, subscriptionItemId);
    await replaceSubscriptionItemHardware({
      subscriptionItemId,
      replacementAssignmentId: text(formData, "replacementAssignmentId"),
      replacedOn: text(formData, "replacedOn"),
    });
    await recordOperationalEvent({
      category: "subscription.hardware_replaced",
      summary: "Service hardware replacement recorded by staff.",
      customerId: subscription.customerId,
      actorUserId: session.sub,
      payload: { subscriptionId, subscriptionItemId, replacementAssignmentId: text(formData, "replacementAssignmentId"), replacedOn: text(formData, "replacedOn") },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    return { message: "Hardware assignment replaced. The prior service and device history were preserved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function transferCanonicalServiceAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const subscriptionItemId = text(formData, "subscriptionItemId");
    const { session, subscription } = await requireManageableCanonicalItem(subscriptionId, subscriptionItemId);
    const targetSubscriptionId = text(formData, "targetSubscriptionId");
    await requireManageableCanonicalSubscription(targetSubscriptionId);
    await transferSubscriptionItem({
      sourceSubscriptionItemId: subscriptionItemId,
      targetSubscriptionId,
      transferDate: text(formData, "transferDate"),
      label: optionalText(formData, "label"),
      agreedAmountPerCycle: optionalText(formData, "agreedAmountPerCycle"),
      rateClassification: text(formData, "classification") === "standard" ? "standard" : "negotiated",
      changeReason: optionalText(formData, "changeReason"),
      successorAssignmentId: optionalText(formData, "successorAssignmentId"),
      createdById: session.sub,
    });
    await recordOperationalEvent({
      category: "subscription.service_transferred",
      summary: "Service transferred between customer agreements by staff.",
      customerId: subscription.customerId,
      actorUserId: session.sub,
      payload: { subscriptionId, subscriptionItemId, targetSubscriptionId, transferDate: text(formData, "transferDate") },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath(`/admin/subscriptions/canonical/${targetSubscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: "Service transferred. Historical service and pricing attribution were preserved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function transitionCanonicalSubscriptionLifecycleAction(
  _previous: CanonicalSubscriptionFormState,
  formData: FormData,
): Promise<CanonicalSubscriptionFormState> {
  const subscriptionId = text(formData, "subscriptionId");
  try {
    const { session, subscription } = await requireManageableCanonicalSubscription(subscriptionId);
    const target = text(formData, "targetLifecycle");
    if (!["active", "paused", "ended", "canceled"].includes(target)) {
      return { error: "Choose a permitted lifecycle outcome." };
    }
    const note = text(formData, "confirmationNote");
    if (!note) return { error: "A staff reason is required for a lifecycle change." };
    await transitionCanonicalSubscriptionLifecycle(subscriptionId, target as "active" | "paused" | "ended" | "canceled");
    await recordOperationalEvent({
      category: "subscription.lifecycle_changed",
      summary: `Subscription lifecycle changed to ${target}.`,
      customerId: subscription.customerId,
      actorUserId: session.sub,
      payload: { subscriptionId, from: subscription.lifecycleStatus, to: target, confirmationNote: note },
    });
    revalidatePath(`/admin/subscriptions/canonical/${subscriptionId}`);
    revalidatePath("/admin/subscriptions/canonical");
    return { message: `Subscription lifecycle updated to ${target.replaceAll("_", " ")}. No invoice, payment, provider, or notification operation was started.` };
  } catch (error) {
    return actionError(error);
  }
}
