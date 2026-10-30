import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { CanonicalCustomerOnboardingForm, type OnboardingExistingSubscription } from "@/components/admin/canonical-customer-onboarding-form";
import { prisma } from "@/lib/db";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";

export const dynamic = "force-dynamic";

function label(customer: { company: string | null; firstName: string | null; lastName: string | null }) {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Unnamed customer";
}

export default async function NewCanonicalSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  const [customers, devices, plans, subscriptions, params] = await Promise.all([
    prisma.customer.findMany({
      where: { archivedAt: null },
      orderBy: [{ company: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, company: true, firstName: true, lastName: true, email: true },
    }),
    prisma.device.findMany({
      where: {
        status: { notIn: ["decommissioned", "lost"] },
        serviceAssignments: { none: { endDate: null, status: { not: "cancelled" } } },
      },
      orderBy: [{ label: "asc" }, { imei: "asc" }],
      select: { id: true, label: true, imei: true, deviceModel: { select: { name: true } }, simCard: { select: { label: true, msisdn: true } } },
    }),
    prisma.subscriptionOption.findMany({
      where: { isActive: true },
      orderBy: { durationMonths: "asc" },
      select: { durationMonths: true, priceXcd: true },
    }),
    prisma.customerSubscription.findMany({
      where: { controlMode: { not: "legacy" }, lifecycleStatus: { in: ["draft", "pending_activation", "active", "paused"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        customerId: true,
        name: true,
        billingIntervalMonths: true,
        nextBillingDate: true,
        _count: { select: { items: { where: { status: { notIn: ["ended", "canceled"] } } } } },
      },
    }),
    searchParams,
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const existingSubscriptions: Record<string, OnboardingExistingSubscription[]> = {};
  for (const subscription of subscriptions) {
    (existingSubscriptions[subscription.customerId] ??= []).push({
      id: subscription.id,
      name: subscription.name,
      billingIntervalMonths: subscription.billingIntervalMonths,
      nextBillingDate: subscription.nextBillingDate?.toISOString().slice(0, 10) ?? null,
      serviceCount: subscription._count.items,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Subscriptions</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">New subscription</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Six short steps. Saving creates a draft only — nothing is invoiced, charged or sent until you activate it.</p>
      </div>
      <CanonicalCustomerOnboardingForm
        customers={customers.map((customer) => ({ id: customer.id, label: label(customer), email: customer.email }))}
        devices={devices.map((device) => ({
          id: device.id,
          label: device.label?.trim() || `${device.deviceModel.name} device`,
          simLabel: device.simCard?.label?.trim() || device.simCard?.msisdn?.trim() || null,
        }))}
        today={today}
        defaultCustomerId={params.customerId}
        plans={plans.map((plan) => ({ durationMonths: plan.durationMonths, priceXcd: plan.priceXcd.toFixed(2) }))}
        existingSubscriptions={existingSubscriptions}
        creationKey={randomUUID()}
      />
    </div>
  );
}
