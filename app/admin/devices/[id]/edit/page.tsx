import type { DeviceStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeviceAssignToCustomerForm } from "@/components/admin/device-assign-customer-form";
import { DeviceCommercialEditForm } from "@/components/admin/device-commercial-edit-form";
import { DeviceGpsLinkForm } from "@/components/admin/device-gps-link-form";
import { DevicePauseServiceForm } from "@/components/admin/device-pause-service-form";
import { DeviceResumeServiceForm } from "@/components/admin/device-resume-service-form";
import { DeviceSimEditSection } from "@/components/admin/device-sim-edit-section";
import { UsagePurposeBadge } from "@/components/admin/device/usage-purpose-badge";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { DeviceServiceAssignmentEditForm } from "@/components/admin/device-service-assignment-edit-form";
import { MarkAssignmentPaidForm } from "@/components/admin/mark-assignment-paid-form";
import { DeviceSetupCommands } from "@/components/admin/device-setup-commands";
import { DeviceUnassignForm } from "@/components/admin/device-unassign-form";
import { SectionTabs } from "@/components/admin/section-tabs";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { DEVICE_STATUS_LABEL } from "@/lib/admin/device-status-labels";
import { fetchSimsAvailableForDeviceSwap } from "@/lib/admin/sims-available-for-device";
import { parseQueryTab } from "@/lib/admin/query-tab";
import { SERVICE_PAUSE_REASON_LABEL } from "@/lib/domain/service-pause";
import { applySetupCommandTokens } from "@/lib/admin/setup-commands";
import { getGpsLink, resolveGpsPortalUrl } from "@/lib/services/device-link-service";
import { prisma } from "@/lib/db";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const DEVICE_EDIT_TABS = ["assignment", "details", "sim", "gps", "setup"] as const;
type DeviceEditTab = (typeof DEVICE_EDIT_TABS)[number];

const DEVICE_EDIT_TAB_ITEMS: { id: DeviceEditTab; label: string }[] = [
  { id: "assignment", label: "Assignment" },
  { id: "details", label: "Details" },
  { id: "sim", label: "SIM" },
  { id: "gps", label: "GPS" },
  { id: "setup", label: "Setup" },
];

function dateInputValue(d: Date | null | undefined): string {
  if (!d) {
    return "";
  }
  return d.toISOString().slice(0, 10);
}

function deviceStatusPillClass(status: DeviceStatus): string {
  switch (status) {
    case "assigned":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
    case "in_stock":
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
    case "suspended":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    case "returned":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";
    case "decommissioned":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
    case "lost":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

export default async function EditDeviceCommercialPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab = parseQueryTab(tabParam, DEVICE_EDIT_TABS, "assignment");
  const [device, customerRows, openAssignment, simsForSwap, gpsLink] = await Promise.all([
    prisma.device.findUnique({
      where: { id },
      include: {
        deviceModel: {
          include: {
            setupCommands: { orderBy: { sortOrder: "asc" } },
          },
        },
        simCard: true,
      },
    }),
    prisma.customer.findMany({
      where: activeCustomerWhere,
      orderBy: [{ company: "asc" }, { lastName: "asc" }],
      select: { id: true, company: true, firstName: true, lastName: true },
    }),
    prisma.serviceAssignment.findFirst({
      where: {
        deviceId: id,
        endDate: null,
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        customerId: true,
        status: true,
        intervalMonths: true,
        startDate: true,
        nextDueDate: true,
        frozenNextDueDate: true,
        pausedAt: true,
        pauseReason: true,
        pauseNote: true,
        invoilessRecurringId: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            company: true,
            firstName: true,
            lastName: true,
            traqcareClientId: true,
            billingMode: true,
          },
        },
      },
    }),
    fetchSimsAvailableForDeviceSwap(),
    getGpsLink(id, "traqcare"),
  ]);

  if (!device) {
    notFound();
  }

  const title = device.label?.trim() || device.imei;
  const customers = customerRows.map((c) => ({ id: c.id, label: customerDisplayName(c) }));
  const canAssign =
    !openAssignment && device.status !== "decommissioned" && device.status !== "lost";
  const isPaused = openAssignment?.status === "suspended";
  const setupCommands = device.deviceModel.setupCommands.map((command) => ({
    id: command.id,
    name: command.name,
    note: command.note,
    body: applySetupCommandTokens(command.body, {
      imei: device.imei,
      serial: device.serialNumber,
      msisdn: device.simCard?.msisdn,
    }),
  }));

  const openTrackingUrl = gpsLink
    ? resolveGpsPortalUrl(gpsLink)
    : resolveGpsPortalUrl({
        provider: "traqcare",
        portalUrl: null,
        externalAccountRef: null,
        externalDeviceId: null,
      });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/devices" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Devices
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${deviceStatusPillClass(device.status)}`}
          >
            {DEVICE_STATUS_LABEL[device.status]}
          </span>
          <UsagePurposeBadge purpose={device.usagePurpose} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <ObjectTypeIcon type={device.objectType} className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <span>
            {device.deviceModel.name} · IMEI {device.imei}
            {device.serialNumber ? ` · Serial ${device.serialNumber}` : ""}
          </span>
        </p>
      </div>

      <SectionTabs
        tabs={DEVICE_EDIT_TAB_ITEMS}
        active={activeTab}
        hrefFor={(tabId) => `/admin/devices/${device.id}/edit?tab=${tabId}`}
        ariaLabel="Device sections"
      />

      {activeTab === "assignment" ? (
        <div className="flex flex-col gap-6">
          {openAssignment ? (
            <section
              id="active-service"
              className="scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {isPaused ? "Paused service" : "Active service"}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Customer{" "}
                <Link
                  href={`/admin/customers/${openAssignment.customerId}`}
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {customerDisplayName(openAssignment.customer)}
                </Link>
                {isPaused ? (
                  <>. Service is paused — renewal reminders are off until you resume.</>
                ) : (
                  <>. Set billing term and dates for this assignment below.</>
                )}
              </p>

              {isPaused ? (
                <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950/40">
                  {openAssignment.pauseReason ? (
                    <p className="text-zinc-800 dark:text-zinc-200">
                      <span className="font-medium">Reason:</span>{" "}
                      {SERVICE_PAUSE_REASON_LABEL[openAssignment.pauseReason]}
                    </p>
                  ) : null}
                  {openAssignment.pausedAt ? (
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                      Paused{" "}
                      {openAssignment.pausedAt.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  ) : null}
                  {openAssignment.pauseNote ? (
                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">{openAssignment.pauseNote}</p>
                  ) : null}
                  {openAssignment.frozenNextDueDate ? (
                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                      Next due frozen at{" "}
                      {openAssignment.frozenNextDueDate.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  ) : null}
                  <DeviceResumeServiceForm
                    deviceId={device.id}
                    assignmentId={openAssignment.id}
                    billingMode={openAssignment.customer.billingMode}
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <DeviceServiceAssignmentEditForm
                    key={`${openAssignment.id}-${openAssignment.updatedAt.toISOString()}`}
                    deviceId={device.id}
                    assignmentId={openAssignment.id}
                    defaultIntervalMonths={openAssignment.intervalMonths}
                    defaultStartDate={dateInputValue(openAssignment.startDate)}
                    defaultNextDueDate={dateInputValue(openAssignment.nextDueDate)}
                    defaultInvoilessRecurringId={openAssignment.invoilessRecurringId ?? ""}
                  />
                  <MarkAssignmentPaidForm
                    key={`paid-${openAssignment.id}-${openAssignment.intervalMonths ?? "x"}-${openAssignment.updatedAt.toISOString()}`}
                    assignmentId={openAssignment.id}
                    customerId={openAssignment.customerId}
                    deviceId={device.id}
                    intervalMonths={openAssignment.intervalMonths}
                    nextDueDate={openAssignment.nextDueDate}
                  />
                  <DevicePauseServiceForm
                    deviceId={device.id}
                    assignmentId={openAssignment.id}
                    billingMode={openAssignment.customer.billingMode}
                  />
                </div>
              )}
              {device.status !== "decommissioned" && device.status !== "lost" ? (
                <DeviceUnassignForm deviceId={device.id} />
              ) : null}
            </section>
          ) : (
            <section
              id="assign-customer"
              className="scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Customer assignment</h2>
              {canAssign ? (
                <>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Assign when the customer is ready. Status will change to{" "}
                    <strong className="font-medium text-zinc-800 dark:text-zinc-200">assigned</strong>.
                  </p>
                  <div className="mt-4">
                    <DeviceAssignToCustomerForm deviceId={device.id} customers={customers} />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Devices marked decommissioned or lost cannot be assigned to a customer.
                </p>
              )}
            </section>
          )}
        </div>
      ) : null}

      {activeTab === "details" ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Device name, purpose &amp; tags</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Friendly name, commercial classification, and labels for search and reporting.
          </p>
          <div className="mt-4">
            <DeviceCommercialEditForm
              key={device.updatedAt.toISOString()}
              deviceId={device.id}
              defaultLabel={device.label ?? ""}
              objectType={device.objectType}
              usagePurpose={device.usagePurpose}
              tags={device.tags}
            />
          </div>
        </section>
      ) : null}

      {activeTab === "sim" ? (
        <DeviceSimEditSection
          deviceId={device.id}
          canEditSim={device.status !== "decommissioned" && device.status !== "lost"}
          currentSim={
            device.simCard
              ? {
                  id: device.simCard.id,
                  iccid: device.simCard.iccid,
                  msisdn: device.simCard.msisdn,
                  label: device.simCard.label,
                }
              : null
          }
          swapSims={simsForSwap}
        />
      ) : null}

      {activeTab === "gps" ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">GPS provider (Traqcare)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Tracking portal for this device. API integration is not connected yet — staff use the vendor portal directly.
          </p>
          <DeviceGpsLinkForm
            deviceId={device.id}
            defaults={{
              portalUrl: gpsLink?.portalUrl ?? "",
              externalDeviceId: gpsLink?.externalDeviceId ?? "",
              externalAccountRef: gpsLink?.externalAccountRef ?? "",
            }}
            customerTraqcareClientId={openAssignment?.customer.traqcareClientId}
            customerLabel={openAssignment ? customerDisplayName(openAssignment.customer) : null}
            openTrackingUrl={openTrackingUrl}
          />
        </section>
      ) : null}

      {activeTab === "setup" ? (
        setupCommands.length > 0 ? (
          <DeviceSetupCommands
            modelName={device.deviceModel.name}
            modelId={device.deviceModel.id}
            commands={setupCommands}
          />
        ) : (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Setup commands</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              No setup commands on {device.deviceModel.name} yet.
            </p>
            <Link
              href={`/admin/device-models/${device.deviceModel.id}/edit#setup-commands`}
              className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Add commands on the device model →
            </Link>
          </section>
        )
      ) : null}
    </div>
  );
}
