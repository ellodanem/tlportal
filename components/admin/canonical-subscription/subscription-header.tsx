import Link from "next/link";

import { SubscriptionLifecycleDialog } from "@/components/admin/canonical-subscription/subscription-lifecycle-dialog";
import { SubscriptionTabsNav } from "@/components/admin/canonical-subscription/subscription-tabs-nav";
import { authorityLabel, collectionLabel, displayDate, money } from "@/components/admin/canonical-subscription/format";
import {
  canonicalIntervalLabel,
  canonicalSubscriptionDisplayName,
} from "@/lib/domain/canonical-subscription-admin";
import {
  subscriptionAddServicePath,
  subscriptionBasePath,
  subscriptionTabs,
} from "@/lib/domain/canonical-subscription-navigation";
import { cadenceLabel, cycleUnitLabel } from "@/lib/domain/subscription-proration";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

/** Subscription-level lifecycle, kept separate from collection state and device health. */
function lifecycleBadge(subscription: SubscriptionDetail, isDraft: boolean) {
  return isDraft ? "Draft" : (subscription.lifecycleStatus ?? subscription.status).replaceAll("_", " ");
}

export function SubscriptionHeader({ subscription, permissions }: { subscription: SubscriptionDetail; permissions: SubscriptionPermissions }) {
  const currency = subscription.currency ?? "XCD";
  const isDraft = permissions.editable && subscription.controlMode === "canonical";
  const agreementName = canonicalSubscriptionDisplayName(subscription.name, subscription.billingIntervalMonths);
  const activeServices = subscription.items.filter((item) => !["ended", "canceled"].includes(item.status));
  const invoiceCount = subscription.invoices.length + subscription.billingInvoices.length;
  const canAddService = permissions.canManage
    && subscription.controlMode === "canonical"
    && ["draft", "pending_activation", "active", "paused"].includes(subscription.lifecycleStatus ?? "");
  const tabs = subscriptionTabs(subscription.id, { showAdvanced: permissions.advanced.any });

  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        <Link href="/admin/subscriptions/canonical" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Subscriptions</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/admin/customers/${subscription.customerId}`} className="hover:underline">{subscription.customerLabel}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="font-medium text-zinc-800 dark:text-zinc-200">{agreementName}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{agreementName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {subscription.customerLabel}{subscription.reference ? ` · ${subscription.reference}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{lifecycleBadge(subscription, isDraft)}</span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">{canonicalIntervalLabel(subscription.billingIntervalMonths)}</span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{collectionLabel(subscription.collectionMethod)}</span>
            {authorityLabel(subscription.access) !== "Canonical" ? <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">{authorityLabel(subscription.access)}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAddService ? <Link href={subscriptionAddServicePath(subscription.id)} className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-800 sm:flex-none">Add service</Link> : null}
          {permissions.canManage ? <SubscriptionLifecycleDialog subscriptionId={subscription.id} lifecycleStatus={subscription.lifecycleStatus ?? ""} /> : null}
        </div>
      </div>

      {subscription.siblings.length > 1 ? (
        <nav aria-label="Other subscriptions for this customer" className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">This customer has {subscription.siblings.length} subscriptions. Each bills on its own schedule.</p>
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {subscription.siblings.map((sibling) => (
              <li key={sibling.id} className="shrink-0">
                <Link href={subscriptionBasePath(sibling.id)} aria-current={sibling.isCurrent ? "page" : undefined} className={`block rounded-lg border px-3 py-2 text-sm ${sibling.isCurrent ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}>
                  <span className="block font-semibold">{cadenceLabel(sibling.billingIntervalMonths)} · {sibling.serviceCount} service{sibling.serviceCount === 1 ? "" : "s"}{sibling.isCurrent ? " · this one" : ""}</span>
                  <span className="block text-xs text-zinc-500">{sibling.nextBillingDate ? `Renews ${displayDate(sibling.nextBillingDate)}` : "No renewal date"} · {(sibling.lifecycleStatus ?? "unclassified").replaceAll("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <section aria-label="Subscription summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Recurring total</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</p><p className="text-xs text-zinc-500">per {cycleUnitLabel(subscription.billingIntervalMonths)}, this subscription only</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Next renewal</p><p className="mt-1 text-xl font-semibold">{displayDate(subscription.nextBillingDate)}</p><p className="text-xs text-zinc-500">{activeServices.length} current service{activeServices.length === 1 ? "" : "s"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Billing method</p><p className="mt-1 text-xl font-semibold">{collectionLabel(subscription.collectionMethod)}</p><p className="text-xs text-zinc-500">{subscription.collectionMethod === "manual_invoice" ? `Grace ${subscription.gracePeriodDays} days` : subscription.collectionMethod === "stripe_autocharge" ? "Stripe-managed collection" : "Choose in Billing & renewal"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Outstanding</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(subscription.summary?.outstandingBalance, currency)}</p><p className="text-xs text-zinc-500">{invoiceCount} linked invoice record{invoiceCount === 1 ? "" : "s"}</p></div>
      </section>

      <SubscriptionTabsNav tabs={tabs} />
    </header>
  );
}
