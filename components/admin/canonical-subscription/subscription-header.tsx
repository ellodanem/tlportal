import Link from "next/link";

import { SubscriptionLifecycleDialog } from "@/components/admin/canonical-subscription/subscription-lifecycle-dialog";
import { SubscriptionSiblingsNav } from "@/components/admin/canonical-subscription/subscription-siblings-nav";
import { SubscriptionTabsNav } from "@/components/admin/canonical-subscription/subscription-tabs-nav";
import { SummaryStrip } from "@/components/admin/canonical-subscription/summary-strip";
import { authorityLabel, billsOnDate, collectionLabel, money } from "@/components/admin/canonical-subscription/format";
import {
  canonicalIntervalLabel,
  canonicalSubscriptionDisplayName,
} from "@/lib/domain/canonical-subscription-admin";
import {
  subscriptionAddServicePath,
  subscriptionTabs,
} from "@/lib/domain/canonical-subscription-navigation";
import { cycleUnitLabel } from "@/lib/domain/subscription-proration";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";
import { customerNewHref } from "@/lib/admin/customer-new";

/** Subscription-level lifecycle, kept separate from collection state and device health. */
function lifecycleBadge(subscription: SubscriptionDetail, isDraft: boolean) {
  return isDraft ? "Draft" : (subscription.lifecycleStatus ?? subscription.status).replaceAll("_", " ");
}

export function SubscriptionHeader({ subscription, permissions }: { subscription: SubscriptionDetail; permissions: SubscriptionPermissions }) {
  const currency = subscription.currency ?? "XCD";
  const isDraft = permissions.editable && subscription.controlMode === "canonical";
  const agreementName = canonicalSubscriptionDisplayName(subscription.name, subscription.billingIntervalMonths);
  const activeServices = subscription.items.filter((item) => billsOnDate(item, subscription.nextBillingDate));
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
        <Link href={customerNewHref({ c: subscription.customerId })} className="hover:underline">{subscription.customerLabel}</Link>
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

      <SubscriptionSiblingsNav siblings={subscription.siblings} />

      <SummaryStrip
        total={money(subscription.summary?.recurringCycleTotal, currency)}
        cycleUnit={cycleUnitLabel(subscription.billingIntervalMonths)}
        serviceCount={activeServices.length}
        nextBillingDate={subscription.nextBillingDate}
        collectionMethod={subscription.collectionMethod}
        gracePeriodDays={subscription.gracePeriodDays}
        outstanding={money(subscription.summary?.outstandingBalance, currency)}
        outstandingNote={subscription.summary?.openingInvoice ? `Unpaid ${subscription.summary.openingInvoice.number ?? "opening invoice"} (current term)` : `${invoiceCount} linked invoice record${invoiceCount === 1 ? "" : "s"}`}
      />

      <SubscriptionTabsNav tabs={tabs} />
    </header>
  );
}
