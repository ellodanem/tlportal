import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingAlerts } from "@/components/admin/customer-billing-alerts";
import { CustomerBillingPanel } from "@/components/admin/customer-billing-panel";
import { CustomerBillingStatusStrip } from "@/components/admin/customer-billing-status-strip";
import { CustomerPaymentDeclineFollowUpCard } from "@/components/admin/customer-payment-decline-follow-up";
import { CustomerRenewalOpsPanel } from "@/components/admin/customer-renewal-ops-panel";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { ManageSubscriptionTiles } from "@/components/admin/manage-subscription-tiles";
import { PaymentRemindersPreferenceForm } from "@/components/admin/payment-reminders-preference-form";
import { StripeInvoicesList } from "@/components/admin/stripe-invoices-list";
import { StripeSyncPanel } from "@/components/admin/stripe-sync-panel";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { loadCustomerBillingPageData } from "@/lib/admin/load-customer-billing";
import { formatMoney } from "@/lib/domain/native-billing";
import { buildPaymentDeclineEmailPreview } from "@/lib/stripe/payment-failure-messaging";
import { isTwilioWhatsAppConfigured } from "@/lib/twilio/config";

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
    stripeSync,
    renewalAssignments,
    paymentDeclineFollowUp,
  } = data;

  const title = customerDisplayName(customer);
  const isManual = customer.billingMode === "manual_legacy";
  const stripeBanner = stripeBannerFromQuery(stripeQuery);
  const declineEmailPreview = paymentDeclineFollowUp
    ? buildPaymentDeclineEmailPreview({
        greetingName: title,
        amountLabel: formatMoney(paymentDeclineFollowUp.amount, paymentDeclineFollowUp.currency),
        kind: paymentDeclineFollowUp.kind,
        invoiceNumber: paymentDeclineFollowUp.invoiceNumber,
        payUrl: paymentDeclineFollowUp.payUrl,
        declineCode: paymentDeclineFollowUp.declineCode,
      })
    : null;

  const renewalPanel = (
    <CustomerRenewalOpsPanel
      customerId={customer.id}
      billingMode={customer.billingMode}
      rows={renewalAssignments}
    />
  );

  const billingPanel = (
    <CustomerBillingPanel
      customerId={customer.id}
      billingMode={customer.billingMode}
      invoilessConfigured={invoilessConfigured}
      stripeConfigured={stripeConfigured}
      hasInvoilessId={Boolean(invoilessId)}
      billingSetup={billingSetup}
    />
  );

  const manageTiles =
    !isManual && stripeConfigured ? (
      <ManageSubscriptionTiles
        customerId={customer.id}
        billingMode={customer.billingMode}
        invoilessConfigured={invoilessConfigured}
        stripeConfigured={stripeConfigured}
        hasInvoilessId={Boolean(invoilessId)}
        billingSetup={billingSetup}
        planOptions={planOptions}
        defaultMonthlyRateXcd={defaultMonthlyRate}
        stripeMonthlyRateXcd={savedMonthlyRate}
        defaultVehicleCount={defaultVehicleCount}
        catalogConfigured={catalogConfigured}
        stripeCustomerId={stripeAccount?.externalCustomerId ?? null}
        renewalRows={renewalAssignments}
      />
    ) : null;

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
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Billing</p>
      </div>

      <CustomerSubnav customerId={customer.id} active="billing" />

      <CustomerBillingAlerts
        billingMode={customer.billingMode}
        setupBanner={setupQuery === "1"}
        setupWarning={setupWarning}
        stripeBanner={stripeBanner}
      />

      <CustomerBillingStatusStrip
        billingMode={customer.billingMode}
        paymentReminders={customer.paymentReminders}
        billingSetup={billingSetup}
        subscription={subscriptionSummary}
        stripeConfigured={stripeConfigured}
        invoilessConfigured={invoilessConfigured}
        stripeSync={stripeSync}
      />

      {stripeSync?.state === "differs" ? (
        <StripeSyncPanel customerId={customer.id} sync={stripeSync} />
      ) : null}

      {manageTiles}

      <PaymentRemindersPreferenceForm
        customerId={customer.id}
        billingMode={customer.billingMode}
        paymentReminders={customer.paymentReminders}
      />

      {paymentDeclineFollowUp ? (
        <CustomerPaymentDeclineFollowUpCard
          followUp={paymentDeclineFollowUp}
          customerId={customer.id}
          emailPreview={declineEmailPreview}
          whatsAppConfigured={isTwilioWhatsAppConfigured()}
        />
      ) : null}

      {isManual ? (
        <>
          <div id="renewal-ops" className="scroll-mt-24">
            {renewalPanel}
          </div>
          {billingPanel}
        </>
      ) : null}

      {customer.billingMode === "stripe_subscription" || stripeInvoices.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Stripe invoices</h2>
          <details className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <summary className="cursor-pointer font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              About mirrored invoices
            </summary>
            <p className="mt-2">
              Mirrored from Stripe webhooks. Paid rows can get a TL receipt PDF (
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TL-INV-…</code>) when Vercel Blob is
              configured. Invoiless Paid mirror runs when the customer is linked there.
            </p>
          </details>
          <div className="mt-4">
            <StripeInvoicesList
              invoices={stripeInvoices}
              customerId={customer.id}
              customerEmail={customer.email}
            />
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
