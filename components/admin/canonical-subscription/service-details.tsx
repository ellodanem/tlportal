import Link from "next/link";

import { cardClass, cycleUnit, displayDate, iso, money, statusPillClass } from "@/components/admin/canonical-subscription/format";
import { ServiceTiming } from "@/components/admin/canonical-subscription/service-timing";
import { EditCanonicalDraftItemForm } from "@/components/admin/canonical-subscription-draft-forms";
import {
  CanonicalServiceHardwareReplacementForm,
  CanonicalServiceTransferForm,
  CanonicalVehicleSaleRemovalForm,
} from "@/components/admin/canonical-subscription-operations-form";
import { subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

type Item = SubscriptionDetail["items"][number];
type Option = { id: string; label: string };

export function SubscriptionServiceDetails({
  subscription,
  item,
  permissions,
  replacementAssignments,
  transferTargets,
}: {
  subscription: SubscriptionDetail;
  item: Item;
  permissions: SubscriptionPermissions;
  replacementAssignments: Option[];
  transferTargets: Option[];
}) {
  const label = item.label || "Tracking service";
  const rate = item.rates.at(-1);
  const currentAmount = rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00";
  const open = item.serviceAssignments.find((entry) => entry.endDate == null && entry.status !== "cancelled");
  const device = open?.device;
  const live = !["ended", "canceled"].includes(item.status);
  const canOperate = permissions.canManage && live;
  const servicesHref = `${subscriptionBasePath(subscription.id)}/services`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={servicesHref} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← All services</Link>
          <h2 className="mt-2 break-words text-xl font-semibold tracking-tight">{label}</h2>
          <ServiceTiming item={item} />
        </div>
        <span className={`${statusPillClass} self-start`}>{item.status.replaceAll("_", " ")}</span>
      </div>

      <section aria-labelledby="current-assignment-heading" className={`${cardClass} p-5`}>
        <h3 id="current-assignment-heading" className="font-semibold">Current assignment and price</h3>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-zinc-500">Tracker</dt><dd className="mt-1 font-medium">{device ? <Link href={`/admin/devices/${device.id}/edit?tab=assignment`} className="text-emerald-700 hover:underline dark:text-emerald-400">{device.label?.trim() || device.deviceModel.name}</Link> : "Not assigned"}</dd>{device?.imei ? <dd className="mt-0.5 break-all text-xs text-zinc-500">{device.imei}</dd> : null}</div>
          <div><dt className="text-xs text-zinc-500">SIM</dt><dd className="mt-1 font-medium">{device?.simCard ? <Link href={`/admin/sims/${device.simCard.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">{device.simCard.label || device.simCard.iccid}</Link> : "None recorded"}</dd></div>
          <div><dt className="text-xs text-zinc-500">Assigned since</dt><dd className="mt-1 font-medium">{displayDate(open?.startDate, "Unknown")}</dd></div>
          <div><dt className="text-xs text-zinc-500">Actual rate</dt><dd className="mt-1 font-semibold tabular-nums">{rate ? `${money(rate.agreedAmountPerCycle.toString(), rate.currency)} / ${cycleUnit(rate.billingIntervalMonths)}` : "Not set"}</dd></div>
        </dl>
        {device && canOperate ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <Link href={`/admin/devices/${device.id}/replace`} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Replace tracker</Link>
            <Link href={`/admin/devices/${device.id}/swap-sim`} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Swap SIM</Link>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-zinc-500">Price changes, scheduling an end and pausing are quick actions on the <Link href={servicesHref} className="font-semibold underline">Services</Link> tab.</p>
      </section>

      {permissions.editable && live ? (
        <section aria-labelledby="edit-details-heading" className={`${cardClass} p-5`}>
          <h3 id="edit-details-heading" className="font-semibold">Service details (draft)</h3>
          <div className="mt-4"><EditCanonicalDraftItemForm item={{ id: item.id, subscriptionId: subscription.id, label: item.label ?? "", notes: item.notes ?? "", serviceActivatedDate: iso(item.serviceActivatedDate), billingEffectiveFrom: iso(item.billingEffectiveFrom) }} /></div>
        </section>
      ) : null}

      {canOperate ? (
        <>
          <section aria-labelledby="hardware-heading" className={`${cardClass} p-5`}>
            <h3 id="hardware-heading" className="font-semibold">Replace hardware</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Before: {device ? device.label?.trim() || device.deviceModel.name : "no tracker assigned"}. After: the chosen replacement assignment takes over from the replacement date. The previous assignment stays in history and billing is unchanged.</p>
            <CanonicalServiceHardwareReplacementForm subscriptionId={subscription.id} subscriptionItemId={item.id} assignments={replacementAssignments} />
          </section>

          <section aria-labelledby="transfer-heading" className={`${cardClass} p-5`}>
            <h3 id="transfer-heading" className="font-semibold">Transfer to another subscription</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Before: this service bills under {subscription.name?.trim() || "this subscription"} at {money(currentAmount, rate?.currency ?? subscription.currency ?? "XCD")}. After: it ends here on the transfer date and a successor service starts under the chosen subscription. Historical invoices and rates are not rewritten.</p>
            <CanonicalServiceTransferForm subscriptionId={subscription.id} subscriptionItemId={item.id} currentAmount={currentAmount} targetSubscriptions={transferTargets} />
          </section>

          {open && device ? (
            <section aria-labelledby="sale-heading" className="space-y-3">
              <h3 id="sale-heading" className="font-semibold">Vehicle sold</h3>
              {open.status === "suspended"
                ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">This tracker assignment is paused. Resume it from the device assignment before recording a sale.</p>
                : <CanonicalVehicleSaleRemovalForm subscriptionId={subscription.id} subscriptionItemId={item.id} assignmentId={open.id} />}
            </section>
          ) : null}
        </>
      ) : null}

      <section aria-labelledby="service-history-heading" className={`${cardClass} p-5`}>
        <h3 id="service-history-heading" className="font-semibold">Price and hardware history</h3>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Price history</h4>
            {item.rates.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {item.rates.map((entry) => (
                  <li key={entry.id} className="flex flex-col justify-between gap-1 rounded-lg bg-zinc-50 px-3 py-2 sm:flex-row dark:bg-zinc-950">
                    <span className="font-medium tabular-nums">{money(entry.agreedAmountPerCycle.toString(), entry.currency)} / {cycleUnit(entry.billingIntervalMonths)} · <span className="capitalize">{entry.classification}</span></span>
                    <span className="text-zinc-500">{displayDate(entry.effectiveFrom)} to {displayDate(entry.effectiveUntil, "open")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-zinc-500">No price history.</p>}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hardware assignments</h4>
            {item.serviceAssignments.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {item.serviceAssignments.map((assignment) => (
                  <li key={assignment.id} className="flex flex-col justify-between gap-1 sm:flex-row">
                    <span>{assignment.device.label?.trim() || assignment.device.deviceModel.name} · <span className="capitalize text-zinc-500">{assignment.status.replaceAll("_", " ")}</span></span>
                    <span className="text-zinc-500">{displayDate(assignment.startDate)} to {displayDate(assignment.endDate, "present")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-zinc-500">No linked device history.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
