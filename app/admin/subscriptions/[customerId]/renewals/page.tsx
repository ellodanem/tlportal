import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingStatusStrip } from "@/components/admin/customer-billing-status-strip";
import { CustomerRenewalOpsPanel } from "@/components/admin/customer-renewal-ops-panel";
import { ManageSubscriptionTiles } from "@/components/admin/manage-subscription-tiles";
import { StripeSyncPanel } from "@/components/admin/stripe-sync-panel";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { loadCustomerBillingPageData } from "@/lib/admin/load-customer-billing";

type Props = { params: Promise<{ customerId: string }> };

export default async function SubscriptionRenewalsPage({ params }: Props) {
  const { customerId } = await params;
  const data = await loadCustomerBillingPageData(customerId);
  if (!data) notFound();

  const {
    customer,
    invoilessConfigured,
    stripeConfigured,
    invoilessId,
    stripeAccount,
    planOptions,
    defaultMonthlyRate,
    savedMonthlyRate,
    savedPlanTermMonths,
    defaultVehicleCount,
    catalogConfigured,
    billingSetup,
    subscriptionSummary,
    stripeSync,
    renewalAssignments,
  } = data;
  const title = customerDisplayName(customer);
  const showCardOperations = customer.billingMode !== "manual_legacy" && stripeConfigured;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/admin/customers/${customer.id}/subscriptions`} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Customer subscriptions</Link>
          <p className="mt-3 text-xs font-medium text-zinc-500">Subscriptions / {title}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Subscription operations</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Manage renewal terms, service dates, and collection operations for this customer’s existing subscription records.</p>
        </div>
        <Link href={`/admin/customers/${customer.id}/billing`} className="w-fit rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700">Customer billing history</Link>
      </div>

      <CustomerBillingStatusStrip
        billingMode={customer.billingMode}
        paymentReminders={customer.paymentReminders}
        billingSetup={billingSetup}
        subscription={subscriptionSummary}
        stripeConfigured={stripeConfigured}
        invoilessConfigured={invoilessConfigured}
        stripeSync={stripeSync}
      />

      {stripeSync?.state === "differs" ? <StripeSyncPanel customerId={customer.id} sync={stripeSync} /> : null}

      {showCardOperations ? <ManageSubscriptionTiles
        customerId={customer.id}
        billingMode={customer.billingMode}
        invoilessConfigured={invoilessConfigured}
        stripeConfigured={stripeConfigured}
        hasInvoilessId={Boolean(invoilessId)}
        billingSetup={billingSetup}
        planOptions={planOptions}
        defaultMonthlyRateXcd={defaultMonthlyRate}
        stripeMonthlyRateXcd={savedMonthlyRate}
        savedPlanTermMonths={savedPlanTermMonths}
        defaultVehicleCount={defaultVehicleCount}
        catalogConfigured={catalogConfigured}
        stripeFeePassthrough={customer.stripeFeePassthrough}
        stripeCustomerId={stripeAccount?.externalCustomerId ?? null}
        renewalRows={renewalAssignments}
        stripePlanTermMonths={savedPlanTermMonths}
      /> : null}

      <CustomerRenewalOpsPanel
        customerId={customer.id}
        billingMode={customer.billingMode}
        rows={renewalAssignments}
        stripePlanTermMonths={savedPlanTermMonths}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Customer financial history</h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">Invoices, payments, reminders, notification delivery, and provider connections remain on the customer Billing tab.</p>
        <Link href={`/admin/customers/${customer.id}/billing`} className="mt-3 inline-block font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open customer billing history</Link>
      </section>
    </div>
  );
}
