import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerAssignmentServiceActions } from "@/components/admin/customer-assignment-service-actions";
import {
  CustomerOverviewBillingRibbon,
  subscriptionStatusLabelForOverview,
} from "@/components/admin/customer-overview-billing-ribbon";
import { UsagePurposeBadge } from "@/components/admin/device/usage-purpose-badge";
import { FleetHealthSummary, type FleetHealthFilter } from "@/components/dashboard/fleet-health-summary";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { prisma } from "@/lib/db";
import { buildInvoilessBillToAddress } from "@/lib/invoiless/customer-sync";
import { fetchInvoicesForInvoilessCustomerId, isInvoilessConfigured } from "@/lib/invoiless/invoices-list";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { displayAssignmentOpsStatus } from "@/lib/admin/assignment-ops-urgency";
import {
  classifyCustomerAssignments,
  fleetHealthCountsFromClassifications,
  reviewReasonLabel,
  type FleetHealthBucket,
} from "@/lib/admin/fleet-health";
import { CopyValueButton } from "@/components/admin/copy-value-button";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { UnarchiveCustomerButton } from "@/components/archive-customer-button";
import {
  getInvoilessExternalCustomerId,
  getStripeBillingAccount,
  isStripeConfigured,
} from "@/lib/services/billing-service";
import {
  getCurrentCustomerSubscription,
  isSubscriptionAttentionStatus,
} from "@/lib/services/customer-subscription-service";
import { resolveGpsPortalUrl } from "@/lib/services/device-link-service";
import { listOperationalEventsForCustomer } from "@/lib/services/operational-event-service";
import { formatPlanTerm } from "@/lib/subscription-options/display";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fleet?: string; archived?: string; unarchived?: string; unarchiveError?: string }>;
};

function parseFleetFilter(raw: string | undefined): FleetHealthFilter {
  if (raw === "healthy" || raw === "renewal" || raw === "review") return raw;
  return "all";
}

const FLEET_FILTER_LABEL: Record<FleetHealthBucket, string> = {
  healthy: "healthy",
  renewal: "due soon / overdue",
  review: "needs review",
};

function formatDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusPill(status: string) {
  const base =
    "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize";
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    due_soon: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    overdue: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200",
    suspended: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
    cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };
  const label =
    status === "suspended"
      ? "Paused"
      : status === "due_soon"
        ? "Due soon"
        : status === "overdue"
          ? "Overdue"
          : status.replace(/_/g, " ");
  return (
    <span className={`${base} ${map[status] ?? map.suspended}`}>
      {label}
    </span>
  );
}

export default async function CustomerDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { fleet: fleetParam, archived, unarchived, unarchiveError } = await searchParams;
  const fleetFilter = parseFleetFilter(fleetParam);

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      serviceAssignments: {
        orderBy: { startDate: "desc" },
        include: {
          device: {
            include: {
              deviceModel: true,
              simCard: true,
              providerDeviceLinks: {
                where: { unlinkedAt: null },
              },
            },
          },
          simCard: true,
        },
      },
    },
  });

  if (!customer) {
    notFound();
  }

  const name = customerDisplayName(customer);
  const [stripeAccount, customerSubscription, invoilessCustomerId] = await Promise.all([
    isStripeConfigured() ? getStripeBillingAccount(customer.id) : Promise.resolve(null),
    getCurrentCustomerSubscription(customer.id),
    getInvoilessExternalCustomerId(customer.id),
  ]);
  const openAssignments = customer.serviceAssignments.filter(
    (a) => a.endDate == null && a.status !== "cancelled",
  );

  const stripeBillingAttention =
    customerSubscription != null
      ? isSubscriptionAttentionStatus(customerSubscription.status)
      : stripeAccount != null &&
        (stripeAccount.status === "past_due" || stripeAccount.status === "unpaid");

  const openHealthInputs = openAssignments.map((a) => ({
    id: a.id,
    status: a.status,
    nextDueDate: a.nextDueDate,
    device: {
      id: a.device.id,
      status: a.device.status,
      simCard: a.device.simCard,
      providerDeviceLinks: a.device.providerDeviceLinks,
    },
    simCard: a.simCard,
  }));

  const openClassifications = classifyCustomerAssignments(openHealthInputs, {
    stripeBillingAttention,
  });
  const fleetHealthCounts = fleetHealthCountsFromClassifications(openClassifications);

  const openClassificationById = new Map(
    openAssignments.map((a, i) => [a.id, openClassifications[i]]),
  );

  const bucketByFilter: FleetHealthBucket | null =
    fleetFilter === "healthy" || fleetFilter === "renewal" || fleetFilter === "review"
      ? fleetFilter
      : null;

  const filteredAssignments =
    bucketByFilter == null
      ? customer.serviceAssignments
      : customer.serviceAssignments.filter((a) => {
          const open = a.endDate == null && a.status !== "cancelled";
          if (!open) return false;
          return openClassificationById.get(a.id)?.bucket === bucketByFilter;
        });

  const customerOverviewHref = `/admin/customers/${customer.id}`;
  const nextDueDates = openAssignments
    .map((a) => a.nextDueDate)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const nextDue = nextDueDates[0];
  const linkedInvoiless = Boolean(invoilessCustomerId);
  const invoilessAddressPreview = buildInvoilessBillToAddress(customer);
  const invoilessApi = isInvoilessConfigured();
  let recentInvoices: Awaited<ReturnType<typeof fetchInvoicesForInvoilessCustomerId>> = [];
  const activityEvents = await listOperationalEventsForCustomer(id, 12);

  if (invoilessApi && invoilessCustomerId) {
    try {
      const hints = [name, customer.email?.trim()].filter(Boolean) as string[];
      recentInvoices = await fetchInvoicesForInvoilessCustomerId(invoilessCustomerId, {
        maxInvoices: 15,
        searchHints: hints,
        matchEmails: customer.email?.trim() ? [customer.email.trim()] : [],
        matchPhones: customer.phone?.trim() ? [customer.phone.trim()] : [],
        maxPagesPerSearchTerm: 4,
        fallbackScanMaxPages: 6,
      });
    } catch {
      recentInvoices = [];
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {customer.archivedAt ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              <strong>Archived</strong> since {formatDate(customer.archivedAt)} — hidden from active lists and billing
              reminders.
            </p>
            <UnarchiveCustomerButton customerId={customer.id} displayName={name} />
          </div>
        </div>
      ) : null}
      {archived === "1" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          Customer archived. They will no longer receive billing reminders.
        </p>
      ) : null}
      {unarchived === "1" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          Customer restored to the active list.
        </p>
      ) : null}
      {unarchiveError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {decodeURIComponent(unarchiveError)}
        </p>
      ) : null}
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/admin/customers"
            className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ← Customers
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">
                {customer.email}
              </a>
            ) : (
              <span className="text-zinc-400">No email</span>
            )}
            {customer.phone ? <span>{customer.phone}</span> : null}
          </div>
          <p className="mt-2 font-mono text-xs text-zinc-500">{customer.id}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/admin/customers/${customer.id}/billing`}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            Billing
          </Link>
          <Link
            href={`/admin/customers/${customer.id}/edit`}
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Edit profile
          </Link>
        </div>
      </div>

      <CustomerSubnav customerId={customer.id} active="overview" />

      <CustomerOverviewBillingRibbon
        customerId={customer.id}
        billingMode={customer.billingMode}
        subscriptionStatusLabel={subscriptionStatusLabelForOverview(
          customer.billingMode,
          customerSubscription,
          stripeAccount?.status,
        )}
        invoilessLinked={linkedInvoiless}
        invoilessCustomerId={invoilessCustomerId}
        nextDue={nextDue}
      />

      <FleetHealthSummary
        counts={fleetHealthCounts}
        activeFilter={fleetFilter}
        baseHref={customerOverviewHref}
        title="Account health"
        subtitle="Open services · click a card to filter the device table below"
        compactWhenAllHealthy
      />

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Billing &amp; contact</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {customer.address ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Address</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{customer.address}</dd>
            </div>
          ) : null}
          {(customer.city || customer.state || customer.postalCode || customer.country) && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">City / region</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
                {[customer.city, customer.state].filter(Boolean).join(", ")}
                {customer.postalCode ? ` ${customer.postalCode}` : ""}
                {customer.country ? ` · ${customer.country}` : ""}
              </dd>
            </div>
          )}
          {customer.legalInfo ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Legal info</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{customer.legalInfo}</dd>
            </div>
          ) : null}
          {customer.invoiceCc ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Invoice Cc</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{customer.invoiceCc}</dd>
            </div>
          ) : null}
          {customer.invoiceBcc ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Invoice Bcc</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{customer.invoiceBcc}</dd>
            </div>
          ) : null}
        </dl>
        {invoilessAddressPreview ? (
          <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Invoiless bill-to address on sync:</span>{" "}
            {invoilessAddressPreview}
          </p>
        ) : null}
        {!customer.address &&
        !customer.city &&
        !customer.state &&
        !customer.postalCode &&
        !customer.country &&
        !customer.legalInfo &&
        !customer.invoiceCc &&
        !customer.invoiceBcc ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No billing address details yet.</p>
        ) : null}
      </section>

      {invoilessApi && linkedInvoiless ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent invoices (Invoiless)</h2>
            <Link
              href={`/admin/invoices?customer=${customer.id}`}
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              All invoices for this customer
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Pulled from Invoiless on each page load. Rows match the linked Invoiless customer id, or the same bill-to
            email as this profile (in case the invoice was created against another Invoiless customer record). Open the
            full list for up to 100 rows or use workspace search from there.
          </p>
          {recentInvoices.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              No matching invoices yet. Confirm invoices in Invoiless use this same customer (the one TL sync created or
              linked), then refresh. You can also open the full customer invoice list to pull a broader search.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {recentInvoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{inv.number ?? inv.id}</span>
                    {inv.status ? (
                      <span className="ml-2 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        {inv.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {inv.previewUrl ? (
                      <a
                        href={inv.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        Open
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Traqcare (GPS)</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Client ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-zinc-800 dark:text-zinc-200">
              {customer.traqcareClientId?.trim() || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Username</dt>
            <dd className="mt-0.5 flex items-center gap-1 text-zinc-800 dark:text-zinc-200">
              <span>{customer.traqcareUsername?.trim() || "—"}</span>
              {customer.traqcareUsername?.trim() ? (
                <CopyValueButton value={customer.traqcareUsername.trim()} kind="username" />
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Password</dt>
            <dd className="mt-0.5 flex items-center gap-1 text-zinc-800 dark:text-zinc-200">
              <span>{customer.traqcarePassword ? "Saved (edit customer to change)" : "—"}</span>
              {customer.traqcarePassword ? (
                <CopyValueButton value={customer.traqcarePassword} kind="password" />
              ) : null}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Portal URL</dt>
            <dd className="mt-0.5">
              {customer.traqcarePortalUrl?.trim() ? (
                <a
                  href={customer.traqcarePortalUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                >
                  {customer.traqcarePortalUrl.trim()}
                </a>
              ) : (
                <span className="text-zinc-800 dark:text-zinc-200">—</span>
              )}
            </dd>
          </div>
        </dl>
        {!customer.traqcareClientId?.trim() &&
        !customer.traqcareUsername?.trim() &&
        !customer.traqcarePassword &&
        !customer.traqcarePortalUrl?.trim() && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No Traqcare settings on file.</p>
        )}
      </section>

      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Device details</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {bucketByFilter
                ? `Showing ${filteredAssignments.length} assignment${filteredAssignments.length === 1 ? "" : "s"} · ${FLEET_FILTER_LABEL[bucketByFilter]} filter`
                : "All service assignments for this customer"}
            </p>
          </div>
          {fleetFilter !== "all" ? (
            <Link
              href={customerOverviewHref}
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Clear filter
            </Link>
          ) : null}
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
            {customer.serviceAssignments.length === 0
              ? "No service assignments yet. When devices are assigned with billing, they will appear here."
              : "No assignments match this filter."}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
              <thead className="bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">SIM</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Health</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Next due</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredAssignments.map((a) => {
                  const iccid = a.device.simCard?.iccid ?? a.simCard?.iccid ?? "—";
                  const simId = a.device.simCard?.id ?? a.simCard?.id;
                  const simStatus = a.device.simCard?.status ?? a.simCard?.status;
                  const modelName = a.device.deviceModel.name;
                  const friendly = a.device.label?.trim() || "Unnamed device";
                  const assignmentOpen = a.endDate == null && a.status !== "cancelled";
                  const deviceManage =
                    assignmentOpen
                      ? `/admin/devices/${a.device.id}/edit#active-service`
                      : `/admin/devices/${a.device.id}/edit`;
                  const classification = openClassificationById.get(a.id);
                  const primaryLink = a.device.providerDeviceLinks[0];
                  const gpsUrl =
                    (primaryLink ? resolveGpsPortalUrl(primaryLink) : null) ??
                    customer.traqcarePortalUrl?.trim() ??
                    null;
                  return (
                    <tr key={a.id} className="bg-white dark:bg-zinc-900">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        <Link
                          href={deviceManage}
                          className="text-emerald-800 hover:underline dark:text-emerald-300"
                          title="Open device — active service"
                        >
                          {a.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <Link
                            href={deviceManage}
                            className="inline-flex items-center gap-2 font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                          >
                            <ObjectTypeIcon
                              type={a.device.objectType}
                              className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                            />
                            {friendly}
                          </Link>
                          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{modelName}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <UsagePurposeBadge purpose={a.device.usagePurpose} />
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-zinc-500">IMEI {a.device.imei}</div>
                          <Link
                            href={deviceManage}
                            className="mt-1 inline-block text-xs font-medium text-zinc-600 underline decoration-zinc-400/60 hover:text-emerald-700 dark:text-zinc-400 dark:hover:text-emerald-400"
                          >
                            Manage device &amp; dates →
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {simId ? (
                          <Link
                            href={`/admin/sims/${simId}`}
                            className="text-emerald-800 break-all hover:underline dark:text-emerald-300"
                          >
                            {iccid}
                          </Link>
                        ) : (
                          iccid
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {statusPill(displayAssignmentOpsStatus(a.status, a.nextDueDate))}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                        {assignmentOpen && classification ? (
                          classification.bucket === "healthy" ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">OK</span>
                          ) : classification.bucket === "renewal" ? (
                            <span className="font-medium text-rose-700 dark:text-rose-400">Due soon / overdue</span>
                          ) : (
                            <span className="text-violet-800 dark:text-violet-300">
                              {classification.reviewReasons.map(reviewReasonLabel).join(", ")}
                            </span>
                          )
                        ) : (
                          "—"
                        )}
                        {simStatus ? (
                          <div className="mt-1 text-zinc-500">SIM {simStatus}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {gpsUrl ? (
                          <a
                            href={gpsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            Open GPS
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {a.intervalMonths != null ? formatPlanTerm(a.intervalMonths) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {a.invoilessRecurringId ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            title={`Invoiless recurring: ${a.invoilessRecurringId}`}
                          >
                            <span aria-hidden="true">↻</span> Linked
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                        )}
                        {a.lastPaymentStatus ? (
                          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {a.lastPaymentStatus}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {a.status === "suspended" ? "—" : formatDate(a.nextDueDate)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(a.startDate)}</td>
                      <td className="px-4 py-3 align-top">
                        <CustomerAssignmentServiceActions
                          assignmentId={a.id}
                          deviceId={a.device.id}
                          billingMode={customer.billingMode}
                          status={a.status}
                          open={assignmentOpen}
                          layout="inline"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activityEvents.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent activity</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Operational log in TL Portal (assignments, billing sync, registrations).
          </p>
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {activityEvents.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">{ev.summary}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{ev.category.replace(/\./g, " · ")}</p>
                </div>
                <time
                  dateTime={ev.occurredAt.toISOString()}
                  className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
                >
                  {ev.occurredAt.toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
