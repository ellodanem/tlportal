import Link from "next/link";
import { notFound } from "next/navigation";

import { DeviceAssignToCustomerForm } from "@/components/admin/device-assign-customer-form";
import { DeviceCommercialEditForm } from "@/components/admin/device-commercial-edit-form";
import { DeviceSimEditSection } from "@/components/admin/device-sim-edit-section";
import { ObjectTypeIcon } from "@/components/device/object-type-icon";
import { DeviceServiceAssignmentEditForm } from "@/components/admin/device-service-assignment-edit-form";
import { DeviceUnassignForm } from "@/components/admin/device-unassign-form";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { fetchSimsAvailableForDeviceSwap } from "@/lib/admin/sims-available-for-device";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

function dateInputValue(d: Date | null | undefined): string {
  if (!d) {
    return "";
  }
  return d.toISOString().slice(0, 10);
}

export default async function EditDeviceCommercialPage({ params }: Props) {
  const { id } = await params;
  const [device, customerRows, openAssignment, simsForSwap] = await Promise.all([
    prisma.device.findUnique({
      where: { id },
      include: { deviceModel: true, simCard: true },
    }),
    prisma.customer.findMany({
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
        intervalMonths: true,
        startDate: true,
        nextDueDate: true,
        invoilessRecurringId: true,
        customer: {
          select: { id: true, company: true, firstName: true, lastName: true },
        },
      },
    }),
    fetchSimsAvailableForDeviceSwap(id),
  ]);

  if (!device) {
    notFound();
  }

  const title = device.label?.trim() || device.imei;
  const customers = customerRows.map((c) => ({ id: c.id, label: customerDisplayName(c) }));
  const canAssign =
    !openAssignment && device.status !== "decommissioned" && device.status !== "lost";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/devices" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Devices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Manage device
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <ObjectTypeIcon type={device.objectType} className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <span>
            {title} · {device.deviceModel.name} · IMEI {device.imei}
          </span>
        </p>
      </div>

      {openAssignment ? (
        <section
          id="active-service"
          className="scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Active service</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Customer{" "}
            <Link
              href={`/admin/customers/${openAssignment.customerId}`}
              className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {customerDisplayName(openAssignment.customer)}
            </Link>
            . Set billing term and dates for this assignment below.
          </p>
          <div className="mt-4">
            <DeviceServiceAssignmentEditForm
              deviceId={device.id}
              assignmentId={openAssignment.id}
              defaultIntervalMonths={openAssignment.intervalMonths}
              defaultStartDate={dateInputValue(openAssignment.startDate)}
              defaultNextDueDate={dateInputValue(openAssignment.nextDueDate)}
              defaultInvoilessRecurringId={openAssignment.invoilessRecurringId ?? ""}
            />
          </div>
          {device.status !== "decommissioned" && device.status !== "lost" ? (
            <DeviceUnassignForm deviceId={device.id} />
          ) : null}
        </section>
      ) : null}

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
        ) : openAssignment ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This device already has an active service. Use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Active service</strong>{" "}
            above to change dates, or open the customer from the link there.
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Devices marked decommissioned or lost cannot be assigned to a customer.
          </p>
        )}
      </section>

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
    </div>
  );
}
