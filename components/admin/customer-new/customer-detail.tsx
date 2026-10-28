import Link from "next/link";
import type { ReactNode } from "react";

import {
  CustomerActivityEvent,
  CustomerActivityEventTime,
  type ActivityEventRow,
} from "@/components/admin/customer-activity-event";
import { CnIcon, type CustomerNewIconName } from "@/components/admin/customer-new/icons";

export type SnapshotSubscription = {
  id: string;
  name: string;
  statusLabel: string;
  tone: "emerald" | "amber" | "zinc" | "blue";
  detail: string;
};

export type CustomerDetailData = {
  id: string;
  name: string;
  initials: string;
  isBusiness: boolean;
  createdAt: Date;
  email: string | null;
  phone: string | null;
  address: string | null;
  billingMethod: string;
  portalEnabled: boolean;
  notes: string | null;
  tags: string[];
  archived: boolean;
  primaryContact: { name: string | null; role: string | null; email: string | null; phone: string | null } | null;
};

export type CustomerDetailProps = {
  customer: CustomerDetailData;
  hasSubscription: boolean;
  outstanding: { label: string; openInvoices: number };
  stats: {
    subscriptionCount: number;
    monthlyValue: string;
    nextRenewal: Date | null;
    services: number;
    collection: string;
  };
  subscriptions: SnapshotSubscription[];
  events: ActivityEventRow[];
  subscriptionsHref: string;
  createSubscriptionHref: string;
  listHref: string;
  className?: string;
};

const TONE: Record<SnapshotSubscription["tone"], string> = {
  emerald: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

/*
 * Layout note: this view is responsive to the width of its own pane (container queries: `@lg`, `@3xl`, …),
 * not just the viewport, because the admin sidebar and the customer list take a variable share of the screen.
 */
const cardClass =
  "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const linkClass = "text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400";
const iconButtonClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 @lg:size-10 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function formatDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

function Pill({ tone, children }: { tone: SnapshotSubscription["tone"]; children: ReactNode }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

function Stat({
  icon,
  iconClass,
  label,
  children,
  footer,
}: {
  icon: CustomerNewIconName;
  iconClass: string;
  label: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 bg-white p-3.5 @lg:flex-row @lg:items-start @lg:gap-3 @lg:p-4 dark:bg-zinc-900">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full @lg:size-11 ${iconClass}`}>
        <CnIcon name={icon} className="size-4 @lg:size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="mt-0.5 break-words text-base font-semibold tabular-nums text-zinc-900 @lg:mt-1 @lg:text-lg dark:text-zinc-50">
          {children}
        </p>
        {footer ? <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{footer}</div> : null}
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: CustomerNewIconName;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
      <CnIcon name={icon} className="mt-0.5 size-5 shrink-0 text-zinc-400" />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
        <dd className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{children}</dd>
      </div>
    </div>
  );
}

function NotProvided() {
  return <span className="text-zinc-400 dark:text-zinc-500">Not provided</span>;
}

function SnapshotRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <dt className={strong ? "font-semibold text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"}>
        {label}
      </dt>
      <dd
        className={`min-w-0 break-words text-right tabular-nums ${
          strong ? "font-semibold text-zinc-900 dark:text-zinc-50" : "font-medium text-zinc-800 dark:text-zinc-200"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function CustomerDetail({
  customer,
  hasSubscription,
  outstanding,
  stats,
  subscriptions,
  events,
  subscriptionsHref,
  createSubscriptionHref,
  listHref,
  className = "",
}: CustomerDetailProps) {
  const statusPill = customer.archived ? (
    <Pill tone="zinc">Archived</Pill>
  ) : hasSubscription ? (
    <Pill tone="emerald">Active</Pill>
  ) : (
    <Pill tone="zinc">No subscription</Pill>
  );

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="@container flex w-full min-w-0 flex-col gap-4 @lg:gap-5">
        {/* Phones / tablets: a clear back button to the list. Side-by-side layout: breadcrumb. */}
        <nav aria-label="Breadcrumb" className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href={listHref}
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium text-emerald-700 hover:bg-emerald-50 xl:hidden dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            <CnIcon name="arrow" className="size-4 rotate-180" />
            All customers
          </Link>
          <span className="hidden xl:inline">
            <Link href={listHref} className="text-emerald-700 hover:underline dark:text-emerald-400">
              Customers
            </Link>
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{customer.name}</span>
          </span>
        </nav>

        <header className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
          <div className="flex min-w-0 gap-3 @lg:gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-semibold text-emerald-900 @lg:size-16 @lg:text-xl dark:bg-emerald-950/60 dark:text-emerald-200">
              {customer.initials}
            </span>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold leading-tight text-zinc-900 @lg:text-2xl dark:text-zinc-50">
                {customer.name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {statusPill}
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {customer.isBusiness ? "Business" : "Individual"} · Since{" "}
                  {customer.createdAt.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
              </div>
              {customer.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customer.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2 @2xl:shrink-0">
            {customer.email ? (
              <a href={`mailto:${customer.email}`} aria-label={`Email ${customer.name}`} className={iconButtonClass}>
                <CnIcon name="mail" className="size-4" />
              </a>
            ) : null}
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} aria-label={`Call ${customer.name}`} className={iconButtonClass}>
                <CnIcon name="phone" className="size-4" />
              </a>
            ) : null}
            <Link
              href={`/admin/customers/${customer.id}/edit`}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 @lg:min-h-10 @2xl:flex-none dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <CnIcon name="pencil" className="size-4" />
              Edit
            </Link>
          </div>
        </header>

        {/* 2×2 on narrow panes (1px gaps act as dividers), one row of four when there is room. */}
        <section
          aria-label="Summary"
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 shadow-sm @3xl:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800"
        >
          <Stat
            icon="doc"
            iconClass="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            label="Outstanding"
            footer={`${outstanding.openInvoices} open invoice${outstanding.openInvoices === 1 ? "" : "s"}`}
          >
            {outstanding.label}
          </Stat>
          <Stat
            icon="layers"
            iconClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            label="Active subscriptions"
            footer={
              <Link
                href={subscriptionsHref}
                className="inline-flex min-h-8 items-center font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                View subscriptions →
              </Link>
            }
          >
            {stats.subscriptionCount}
          </Stat>
          <Stat
            icon="coin"
            iconClass="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
            label="Monthly value"
          >
            {stats.monthlyValue}
          </Stat>
          <Stat
            icon="calendar"
            iconClass="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
            label="Next renewal"
          >
            {formatDate(stats.nextRenewal)}
          </Stat>
        </section>

        <div className="grid gap-4 @lg:gap-5 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className={`${cardClass} h-fit overflow-hidden`}>
            <h3 className="border-b border-zinc-100 px-4 py-3.5 text-base font-semibold text-zinc-900 @lg:px-5 @lg:py-4 dark:border-zinc-800 dark:text-zinc-50">
              Customer Information
            </h3>
            <dl className="-mb-px grid @lg:grid-cols-2">
              <Field icon="user" label="Primary Contact">
                {customer.primaryContact?.name ? (
                  <>
                    <span className="font-medium">{customer.primaryContact.name}</span>
                    {customer.primaryContact.role ? (
                      <span className="block text-xs text-zinc-500">{customer.primaryContact.role}</span>
                    ) : null}
                    {customer.primaryContact.email ? (
                      <span className="block text-xs text-zinc-500">{customer.primaryContact.email}</span>
                    ) : null}
                  </>
                ) : (
                  <NotProvided />
                )}
              </Field>
              <Field icon="mail" label="Email">
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">
                    {customer.email}
                  </a>
                ) : (
                  <NotProvided />
                )}
              </Field>
              <Field icon="phone" label="Phone">
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">
                    {customer.phone}
                  </a>
                ) : (
                  <NotProvided />
                )}
              </Field>
              <Field icon="pin" label="Billing Address">
                {customer.address ? <span className="whitespace-pre-line">{customer.address}</span> : <NotProvided />}
              </Field>
              <Field icon="card" label="Billing Method">
                {customer.billingMethod}
              </Field>
              <Field icon="monitor" label="Portal Status">
                {customer.portalEnabled ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                    <span className="size-2 rounded-full bg-red-500" aria-hidden="true" />
                    Disabled
                  </span>
                )}
              </Field>
              <div className="@lg:col-span-2">
                <Field icon="note" label="Notes">
                  {customer.notes ? <span className="whitespace-pre-wrap">{customer.notes}</span> : <NotProvided />}
                </Field>
              </div>
            </dl>
          </section>

          <div className="flex min-w-0 flex-col gap-4 @lg:gap-5">
            <section className={`${cardClass} p-4 @lg:p-5`}>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Recent Activity</h3>
              {events.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No activity recorded yet.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {events.map((ev, i) => (
                    <li key={ev.id} className="relative flex gap-3">
                      {i < events.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-[9px] top-6 h-[calc(100%-0.5rem)] w-px bg-zinc-200 dark:bg-zinc-700"
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-emerald-600 bg-white dark:border-emerald-500 dark:bg-zinc-900"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <CustomerActivityEvent event={ev} />
                        <CustomerActivityEventTime occurredAt={ev.occurredAt} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${cardClass} p-4 @lg:p-5 ${hasSubscription ? "" : "border-dashed"}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Subscription Snapshot</h3>
                {hasSubscription ? (
                  <Link
                    href={subscriptionsHref}
                    className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    Open subscriptions
                  </Link>
                ) : null}
              </div>

              {hasSubscription ? (
                <>
                  <dl className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                    <SnapshotRow label="Current subscriptions" value={stats.subscriptionCount} />
                    <SnapshotRow label="Billable GPS services" value={stats.services} />
                    <SnapshotRow label="Collection method" value={stats.collection} />
                    <SnapshotRow label="Next renewal" value={formatDate(stats.nextRenewal)} />
                    <SnapshotRow strong label="Monthly value" value={stats.monthlyValue} />
                  </dl>
                  <ul className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                    {subscriptions.map((sub) => (
                      <li key={sub.id} className="flex flex-col gap-2 py-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-50">{sub.name}</p>
                          <p className="break-words text-xs text-zinc-500 dark:text-zinc-400">{sub.detail}</p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <Pill tone={sub.tone}>{sub.statusLabel}</Pill>
                          <Link href={subscriptionsHref} className={`${linkClass} inline-flex min-h-10 items-center`}>
                            View →
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="mt-4 flex flex-col items-center gap-3 rounded-lg bg-zinc-50/80 px-4 py-8 text-center dark:bg-zinc-950/40">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">No active subscriptions</p>
                  <p className="max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
                    Create the customer&apos;s first subscription to start billing for GPS tracking.
                  </p>
                  <Link
                    href={createSubscriptionHref}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 @lg:w-auto dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    <CnIcon name="plus" className="size-4" />
                    Create subscription
                  </Link>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
