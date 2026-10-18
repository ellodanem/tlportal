import Link from "next/link";
import { redirect } from "next/navigation";

import { SubscriptionComposer } from "@/components/admin/subscription-composer";
import { prisma } from "@/lib/db";
import { getDefaultMonthlyRateXcd } from "@/lib/stripe/checkout-pricing";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;
  if (canonicalSubscriptionUiVisible()) {
    redirect(`/admin/subscriptions/canonical/new${customerId ? `?customerId=${encodeURIComponent(customerId)}` : ""}`);
  }
  const [customers, defaultRate] = await Promise.all([
    prisma.customer.findMany({
      where: { archivedAt: null },
      orderBy: [{ company: "asc" }, { lastName: "asc" }],
      select: { id: true, company: true, firstName: true, lastName: true, email: true },
    }),
    getDefaultMonthlyRateXcd(),
  ]);
  const options = customers.map((customer) => ({
    id: customer.id,
    name: customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Unnamed customer",
    email: customer.email,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Subscriptions
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Create subscription</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Create one recurring relationship and choose how each billing cycle will be collected.
        </p>
      </div>
      <SubscriptionComposer customers={options} defaultRate={defaultRate} defaultCustomerId={customerId} />
    </div>
  );
}
