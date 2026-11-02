import Link from "next/link";

import { cycleUnit, displayDate, iso, money, serviceStatusLabel, servicePillClass } from "@/components/admin/canonical-subscription/format";
import { ArrowLeftIcon, BoatIcon, CalendarIcon, CoinsIcon, PinIcon, SimIcon } from "@/components/admin/canonical-subscription/icons";
import { ServiceHistorySummary } from "@/components/admin/canonical-subscription/service-history";
import { OtherServiceActions, ServiceQuickActions, ServiceStatusControl } from "@/components/admin/canonical-subscription/service-action-panels";
import { ServiceTiming } from "@/components/admin/canonical-subscription/service-timing";
import { EditCanonicalDraftItemForm } from "@/components/admin/canonical-subscription-draft-forms";
import type { SubscriptionDetail, SubscriptionPermissions } from "@/lib/admin/canonical-subscription-page-data";
import {
  currentServiceRate,
  resolveServiceActionAvailability,
  scheduledServiceRate,
} from "@/lib/domain/canonical-service-presentation";
import type { ServiceHistoryRow } from "@/lib/domain/canonical-service-history";
import { canonicalSubscriptionDisplayName } from "@/lib/domain/canonical-subscription-admin";
import { subscriptionBasePath, subscriptionServicePath } from "@/lib/domain/canonical-subscription-navigation";

type Item = SubscriptionDetail["items"][number];
type Option = { id: string; label: string };

const cardClass = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

function serviceName(item: Item, index: number) {
  return item.label?.trim() || `Service ${index + 1}`;
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 bg-white px-4 py-3 dark:bg-zinc-900">
      <span className="mt-0.5 shrink-0 text-zinc-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="mt-0.5 min-w-0 break-words text-sm">{children}</dd>
      </div>
    </div>
  );
}

const linkClass = "text-emerald-700 hover:underline dark:text-emerald-400";

export function SubscriptionServiceDetails({
  subscription,
  item,
  permissions,
  replacementAssignments,
  transferTargets,
  history,
}: {
  subscription: SubscriptionDetail;
  item: Item;
  permissions: SubscriptionPermissions;
  replacementAssignments: Option[];
  transferTargets: Option[];
  history: ServiceHistoryRow[];
}) {
  const today = new Date();
  const itemIndex = subscription.items.findIndex((candidate) => candidate.id === item.id);
  const label = serviceName(item, Math.max(itemIndex, 0));
  const rate = currentServiceRate(item.rates, today);
  const scheduledRate = scheduledServiceRate(item.rates, today);
  const currency = rate?.currency ?? subscription.currency ?? "XCD";
  const currentAmount = rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00";
  const open = item.serviceAssignments.find((entry) => entry.endDate == null && entry.status !== "cancelled");
  const device = open?.device;
  const trackerLabel = device ? device.label?.trim() || device.deviceModel.name : "the tracker";
  const sim = device?.simCard ?? null;
  const live = !["ended", "canceled"].includes(item.status);
  const status = serviceStatusLabel(item, today);
  const started = item.serviceActivatedDate ?? item.billingEffectiveFrom;
  const subscriptionLabel = canonicalSubscriptionDisplayName(subscription.name, subscription.billingIntervalMonths);
  const servicesHref = `${subscriptionBasePath(subscription.id)}/services`;
  const rateText = rate ? `${money(rate.agreedAmountPerCycle.toString(), rate.currency)} / ${cycleUnit(rate.billingIntervalMonths)}` : "Not set";
  const scheduledRateText = scheduledRate
    ? `${money(scheduledRate.agreedAmountPerCycle.toString(), scheduledRate.currency)} / ${cycleUnit(scheduledRate.billingIntervalMonths)} from ${displayDate(scheduledRate.effectiveFrom)}`
    : null;

  const availability = resolveServiceActionAvailability({
    canManage: permissions.canManage,
    itemStatus: item.status,
    openAssignment: open ? { status: open.status } : null,
    billingEffectiveUntil: item.billingEffectiveUntil,
    alreadyTransferred: Boolean(item.successorItem),
    transferTargetCount: transferTargets.length,
  });
  const billedByStripe = subscription.collectionMethod === "stripe_autocharge";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={servicesHref} aria-label="Back to all services" title="All services" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
          <ArrowLeftIcon />
        </Link>
        <span aria-hidden="true" className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 sm:flex dark:bg-emerald-950/40 dark:text-emerald-300"><BoatIcon /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="service-heading" tabIndex={-1} className="min-w-0 break-words text-xl font-semibold tracking-tight outline-none">{label}</h2>
            <span className={servicePillClass(item, status.tone)}>{status.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">
            {started ? `Started ${displayDate(started)} · ` : ""}{subscriptionLabel}
          </p>
        </div>
      </div>

      {subscription.items.length > 1 ? (
        <nav aria-label="Services in this subscription" className="-mt-1">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {subscription.items.map((candidate, index) => {
              const current = candidate.id === item.id;
              const closed = ["ended", "canceled"].includes(candidate.status);
              return (
                <li key={candidate.id} className="shrink-0">
                  <Link
                    href={subscriptionServicePath(subscription.id, candidate.id)}
                    aria-current={current ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${current ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
                  >
                    {serviceName(candidate, index)}
                    {closed ? <span className="text-xs font-normal text-zinc-500">{candidate.status === "canceled" ? "canceled" : "ended"}</span> : candidate.status === "paused" ? <span className="text-xs font-normal text-amber-700 dark:text-amber-300">paused</span> : null}
                  </Link>
                </li>
              );
            })}
            <li className="shrink-0">
              <Link href={servicesHref} className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">All services</Link>
            </li>
          </ul>
        </nav>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="service-details-heading" className={`${cardClass} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between gap-3">
            <h3 id="service-details-heading" className="text-base font-semibold">Service details</h3>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <dl className="grid gap-px bg-zinc-200 sm:grid-cols-2 dark:bg-zinc-800">
            <Field icon={<PinIcon className="size-4" />} label="Tracker">
              {device ? (
                <>
                  <Link href={`/admin/devices/${device.id}/edit?tab=assignment`} className={`font-semibold ${linkClass}`}>{trackerLabel}</Link>
                  {device.imei ? <span className="block break-all text-xs text-zinc-500">{device.imei}</span> : null}
                </>
              ) : <span className="font-semibold">Not assigned</span>}
            </Field>
            <Field icon={<SimIcon className="size-4" />} label="SIM">
              {sim ? (
                <>
                  <Link href={`/admin/sims/${sim.id}`} className={`break-all font-semibold ${linkClass}`}>{sim.iccid}</Link>
                  {sim.label && sim.label !== sim.iccid ? <span className="block text-xs text-zinc-500">{sim.label}</span> : null}
                </>
              ) : <span className="font-semibold">{device ? "None recorded" : "—"}</span>}
            </Field>
            <Field icon={<CoinsIcon className="size-4" />} label="Service rate">
              <span className="font-semibold tabular-nums">{rateText}</span>
              {rate ? <span className="block text-xs text-zinc-500">{rate.classification === "negotiated" ? "Negotiated rate" : "Standard rate"}{rate.billingIntervalMonths !== 1 ? ` · ${money(Number(rate.agreedAmountPerCycle) / rate.billingIntervalMonths, rate.currency)} / month equivalent` : ""}</span> : null}
              {scheduledRateText ? <span className="block text-xs text-amber-800 dark:text-amber-300">Scheduled: {scheduledRateText}</span> : null}
            </Field>
            <Field icon={<CalendarIcon className="size-4" />} label="Assigned since">
              <span className="font-semibold">{open ? displayDate(open.startDate, "Unknown") : "—"}</span>
            </Field>
          </dl>
            <div role="group" aria-label="Service status" className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">Status</p>
                  <p className="mt-1"><span className={servicePillClass(item, status.tone)}>{status.label}</span></p>
                  <ServiceTiming item={item} />
                </div>
                {permissions.canManage && live ? (
                  <ServiceStatusControl
                    subscriptionId={subscription.id}
                    itemId={item.id}
                    assignmentId={open?.id ?? null}
                    trackerLabel={trackerLabel}
                    billedByStripe={billedByStripe}
                    pause={availability.pause}
                    resume={availability.resume}
                  />
                ) : null}
              </div>
              {permissions.canManage && live && open?.status === "suspended" && !availability.resume.enabled && availability.resume.reason ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{availability.resume.reason}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <ServiceQuickActions
              subscriptionId={subscription.id}
              itemId={item.id}
              serviceLabel={label}
              device={device ? { id: device.id, label: trackerLabel } : null}
              replacementAssignments={replacementAssignments}
              nextBillingDate={iso(subscription.nextBillingDate)}
              currentAmount={currentAmount}
              currency={currency}
              currentRateText={rateText}
              scheduledRateText={scheduledRateText}
              availability={availability}
            />
          </div>
        </section>

        <section aria-labelledby="other-actions-heading" className={`${cardClass} p-5`}>
          <h3 id="other-actions-heading" className="text-base font-semibold">Other service actions</h3>
          <div className="mt-4">
            <OtherServiceActions
              subscriptionId={subscription.id}
              itemId={item.id}
              serviceLabel={label}
              subscriptionLabel={subscriptionLabel}
              currentAmount={currentAmount}
              currency={currency}
              transferTargets={transferTargets}
              assignment={open && device ? { id: open.id, trackerLabel, simLabel: sim ? `SIM ${sim.iccid}` : null } : null}
              billingEndsOn={iso(item.billingEffectiveUntil) || null}
              availability={availability}
            />
          </div>
        </section>
      </div>

      {permissions.editable && live ? (
        <section aria-labelledby="edit-details-heading" className={`${cardClass} p-5`}>
          <h3 id="edit-details-heading" className="text-base font-semibold">Service details (draft)</h3>
          <div className="mt-4"><EditCanonicalDraftItemForm item={{ id: item.id, subscriptionId: subscription.id, label: item.label ?? "", notes: item.notes ?? "", serviceActivatedDate: iso(item.serviceActivatedDate), billingEffectiveFrom: iso(item.billingEffectiveFrom) }} /></div>
        </section>
      ) : null}

      <ServiceHistorySummary subscriptionId={subscription.id} itemId={item.id} serviceLabel={label} rows={history} />
    </div>
  );
}
