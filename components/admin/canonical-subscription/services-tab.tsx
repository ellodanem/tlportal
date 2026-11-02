import Link from "next/link";

import { cardClass, cycleUnit, iso, money, serviceStatusLabel, statusPillClass, warningPillClass } from "@/components/admin/canonical-subscription/format";
import { ServiceTiming } from "@/components/admin/canonical-subscription/service-timing";
import { CustomerServiceManagementModal } from "@/components/admin/customer-service-management-modal";
import {
  subscriptionAddServicePath,
  subscriptionServicePath,
} from "@/lib/domain/canonical-subscription-navigation";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";

type Item = SubscriptionDetail["items"][number];

function StatusPill({ item }: { item: Item }) {
  const { label, tone } = serviceStatusLabel(item);
  return <span className={`${tone === "warning" ? warningPillClass : statusPillClass} capitalize`}>{label}</span>;
}

function currentAssignment(item: Item) {
  return item.serviceAssignments.find((entry) => entry.endDate == null && entry.status !== "cancelled") ?? item.serviceAssignments.at(-1);
}

function RowActions({ subscription, item, label, canManage }: { subscription: SubscriptionDetail; item: Item; label: string; canManage: boolean }) {
  const rate = item.rates.at(-1);
  const assignment = currentAssignment(item);
  const device = assignment?.device;
  const open = assignment && assignment.endDate == null && assignment.status !== "cancelled" && device;
  const href = subscriptionServicePath(subscription.id, item.id);
  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      {canManage && !["ended", "canceled"].includes(item.status) ? (
        <CustomerServiceManagementModal
          subscriptionId={subscription.id}
          subscriptionItemId={item.id}
          serviceLabel={label}
          nextBillingDate={iso(subscription.nextBillingDate)}
          currentAmount={rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00"}
          servicePageHref={href}
          assignment={open ? { id: assignment.id, deviceId: device.id, deviceLabel: device.label?.trim() || device.deviceModel.name, status: assignment.status } : null}
        />
      ) : null}
      <Link href={href} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Open</Link>
    </div>
  );
}

export function SubscriptionServicesTab({ subscription, permissions }: { subscription: SubscriptionDetail; permissions: SubscriptionPermissions }) {
  const canAddService = permissions.canManage && subscription.controlMode === "canonical"
    && ["draft", "pending_activation", "active", "paused"].includes(subscription.lifecycleStatus ?? "");
  const items = subscription.items;

  return (
    <section aria-labelledby="services-heading" className={cardClass}>
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div>
          <h2 id="services-heading" className="text-lg font-semibold">Billable services ({items.length})</h2>
          <p className="mt-1 text-sm text-zinc-500">One row per service, with its own price per billing cycle and current hardware.</p>
        </div>
        {canAddService ? <Link href={subscriptionAddServicePath(subscription.id)} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-800">Add service</Link> : null}
      </div>
      {items.length ? (
        <>
          <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
            {items.map((item, index) => {
              const rate = item.rates.at(-1);
              const device = currentAssignment(item)?.device;
              const label = item.label || `Service ${index + 1}`;
              return (
                <li key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="font-semibold">{label}</h3><ServiceTiming item={item} /></div>
                    <StatusPill item={item} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-xs text-zinc-500">Device</dt><dd className="mt-1 font-medium">{device ? device.label?.trim() || device.deviceModel.name : "Not assigned"}</dd>{device?.imei ? <dd className="mt-0.5 break-all text-xs text-zinc-500">{device.imei}</dd> : null}</div>
                    <div><dt className="text-xs text-zinc-500">Actual rate</dt><dd className="mt-1 font-semibold tabular-nums">{rate ? `${money(rate.agreedAmountPerCycle.toString(), rate.currency)} / ${cycleUnit(rate.billingIntervalMonths)}` : "Not set"}</dd></div>
                  </dl>
                  <div className="mt-4"><RowActions subscription={subscription} item={item} label={label} canManage={permissions.canManage} /></div>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Billable services for this subscription</caption>
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
                <tr><th scope="col" className="px-4 py-3">Service</th><th scope="col" className="px-4 py-3">Device / SIM</th><th scope="col" className="px-4 py-3">Actual rate</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((item, index) => {
                  const rate = item.rates.at(-1);
                  const device = currentAssignment(item)?.device;
                  const label = item.label || `Service ${index + 1}`;
                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-4"><Link href={subscriptionServicePath(subscription.id, item.id)} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">{label}</Link><ServiceTiming item={item} /></td>
                      <td className="px-4 py-4">
                        {device ? <><Link href={`/admin/devices/${device.id}/edit?tab=assignment`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{device.label?.trim() || device.deviceModel.name}</Link><p className="mt-1 text-xs text-zinc-500">{device.imei || device.deviceModel.name}</p></> : <span className="text-zinc-500">Not assigned</span>}
                        {device?.simCard ? <p className="mt-1 text-xs"><Link href={`/admin/sims/${device.simCard.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">SIM {device.simCard.label || device.simCard.iccid}</Link></p> : null}
                      </td>
                      <td className="px-4 py-4"><p className="font-semibold tabular-nums">{rate ? `${money(rate.agreedAmountPerCycle.toString(), rate.currency)} / ${cycleUnit(rate.billingIntervalMonths)}` : "Not set"}</p>{rate && rate.billingIntervalMonths !== 1 ? <p className="mt-1 text-xs text-zinc-500">{money(Number(rate.agreedAmountPerCycle) / rate.billingIntervalMonths, rate.currency)} / month equivalent</p> : null}</td>
                      <td className="px-4 py-4"><StatusPill item={item} /></td>
                      <td className="px-4 py-4"><RowActions subscription={subscription} item={item} label={label} canManage={permissions.canManage} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : <div className="p-10 text-center text-sm text-zinc-500">No billable services have been added.</div>}
    </section>
  );
}
