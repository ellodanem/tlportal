import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingPanel } from "@/components/admin/customer-billing-panel";
import { CustomerRenewalOpsPanel } from "@/components/admin/customer-renewal-ops-panel";
import { CustomerSubscriptionSummary } from "@/components/admin/customer-subscription-summary";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { StripeInvoicesList } from "@/components/admin/stripe-invoices-list";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { loadCustomerBillingPageData } from "@/lib/admin/load-customer-billing";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stripe?: string; setup?: string; warn?: string }>;
};

function stripeBannerFromQuery(raw: string | undefined): "success" | "cancel" | null {
  if (raw === "success") return "success";
  if (raw === "cancel") return "cancel";
  return null;
}

export default async function CustomerBillingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { stripe: stripeQuery, setup: setupQuery, warn: warnQuery } = await searchParams;
  const setupWarning = warnQuery ? decodeURIComponent(warnQuery) : null;
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
    billingSetup,
    stripeInvoices,
    subscriptionSummary,
    renewalAssignments,
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

      {setupQuery === "1" ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            {customer.billingMode === "stripe_subscription" ? (
              <>
                Billing setup linked provider accounts only — no TL subscription and no Checkout session were
                started. When the customer is ready to pay by card, use <strong>Create payment link</strong> below;
                that creates a pending subscription and sends them to Stripe.
              </>
            ) : (
              <>
                Billing setup linked Invoiless (manual / cash billing). Card subscriptions are not used in this
                mode. Issue invoices in Invoiless or switch billing mode to Stripe when you want card billing.
              </>
            )}
          </p>
          {setupWarning ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {setupWarning}
            </p>
          ) : null}
        </div>
      ) : null}

      {subscriptionSummary ? (
        <CustomerSubscriptionSummary {...subscriptionSummary} />
      ) : customer.billingMode === "stripe_subscription" ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          No subscription record yet — normal right after setup. Create a payment link below to start a pending
          subscription, or wait for Stripe webhooks if checkout already completed.
        </p>
      ) : null}

      <CustomerRenewalOpsPanel
        customerId={customer.id}
        billingMode={customer.billingMode}
        rows={renewalAssignments}
      />

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
        billingSetup={billingSetup}
        stripeBanner={stripeBannerFromQuery(stripeQuery)}
      />

      {customer.billingMode === "stripe_subscription" || stripeInvoices.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Stripe invoices</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Mirrored from Stripe for this customer.{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">invoice.paid</code> also creates a Paid
            Invoiless invoice when the customer is linked there. Ensure{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">invoice.finalized</code> is subscribed if
            missing.
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

