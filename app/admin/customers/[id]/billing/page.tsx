import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingPanel } from "@/components/admin/customer-billing-panel";
import { CustomerSubscriptionSummary } from "@/components/admin/customer-subscription-summary";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { StripeInvoicesList } from "@/components/admin/stripe-invoices-list";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { loadCustomerBillingPageData } from "@/lib/admin/load-customer-billing";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stripe?: string }>;
};

function stripeBannerFromQuery(raw: string | undefined): "success" | "cancel" | null {
  if (raw === "success") return "success";
  if (raw === "cancel") return "cancel";
  return null;
}

export default async function CustomerBillingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { stripe: stripeQuery } = await searchParams;
  const data = await loadCustomerBillingPageData(id);
  if (!data) {
    notFound();
  }

  const {
    customer,
    invoilessConfigured,
    stripeConfigured,
    invoilessId,
    stripeAccount,
    planOptions,
    defaultMonthlyRate,
    savedMonthlyRate,
    defaultVehicleCount,
    catalogConfigured,
    stripeInvoices,
    subscriptionSummary,
  } = data;

  const title = customerDisplayName(customer);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Subscriptions, payment links, and Stripe invoices
        </p>
      </div>

      <CustomerSubnav customerId={customer.id} active="billing" />

      {subscriptionSummary ? (
        <CustomerSubscriptionSummary {...subscriptionSummary} />
      ) : customer.billingMode === "stripe_subscription" ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          No subscription record yet. Create a payment link below to start a pending subscription, or wait
          for Stripe webhooks if checkout already completed.
        </p>
      ) : null}

      <CustomerBillingPanel
        customerId={customer.id}
        billingMode={customer.billingMode}
        invoilessConfigured={invoilessConfigured}
        stripeConfigured={stripeConfigured}
        hasInvoilessId={Boolean(invoilessId)}
        stripeCustomerId={stripeAccount?.externalCustomerId ?? null}
        planOptions={planOptions}
        defaultMonthlyRateXcd={defaultMonthlyRate}
        stripeMonthlyRateXcd={savedMonthlyRate}
        defaultVehicleCount={defaultVehicleCount}
        catalogConfigured={catalogConfigured}
        stripeBanner={stripeBannerFromQuery(stripeQuery)}
      />

      {customer.billingMode === "stripe_subscription" || stripeInvoices.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Stripe invoices</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Mirrored from Stripe for this customer. Add webhook events{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">invoice.paid</code> and{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">invoice.finalized</code> if missing.
          </p>
          <div className="mt-4">
            <StripeInvoicesList invoices={stripeInvoices} />
          </div>
        </section>
      ) : null}

      <p className="text-sm text-zinc-500">
        <Link
          href={`/admin/customers/${customer.id}/edit`}
          className="text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Edit profile &amp; address
        </Link>
        {" · "}
        <Link href={`/admin/customers/${customer.id}`} className="hover:underline">
          Customer overview
        </Link>
      </p>
    </div>
  );
}

