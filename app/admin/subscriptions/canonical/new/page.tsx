import Link from "next/link";
import { notFound } from "next/navigation";

import { CanonicalCustomerOnboardingForm } from "@/components/admin/canonical-customer-onboarding-form";
import { prisma } from "@/lib/db";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";

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
  const [customers, devices, params] = await Promise.all([
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
    searchParams,
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Canonical subscriptions</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Onboard a canonical customer</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Create a new customer or select an existing one, define one commercial subscription with services and equipment, then review it without affecting live billing.</p>
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
      />
    </div>
  );
}
