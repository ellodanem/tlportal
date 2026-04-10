import type { DeviceStatus, DeviceUsagePurpose } from "@prisma/client";

import { customerDisplayName, customerInitials } from "@/lib/admin/customer-list";
import { DEVICE_STATUS_LABEL } from "@/lib/admin/device-status-labels";
import { DEVICE_USAGE_PURPOSE_LABEL } from "@/lib/admin/device-usage-purpose";

export type DeviceListRow = {
  id: string;
  label: string | null;
  imei: string;
  serialNumber: string | null;
  firmwareVersion: string | null;
  status: DeviceStatus;
  usagePurpose: DeviceUsagePurpose;
  tags: string[];
  deviceModel: { name: string; manufacturer: string | null };
  modelInitials: string;
  sim: {
    id: string;
    iccid: string;
    msisdn: string | null;
    lastSyncedAt: Date | null;
  } | null;
  assignedCustomer: {
    id: string;
    displayName: string;
    initials: string;
  } | null;
};

export function modelInitials(manufacturer: string | null, modelName: string): string {
  const m = manufacturer?.trim();
  if (m && m.length >= 2) return m.slice(0, 2).toUpperCase();
  const parts = modelName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return modelName.slice(0, 2).toUpperCase() || "?";
}

export function deviceMatchesSearchQuery(row: DeviceListRow, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  const parts: string[] = [
    row.imei,
    row.serialNumber ?? "",
    row.label ?? "",
    row.deviceModel.name,
    row.deviceModel.manufacturer ?? "",
    row.firmwareVersion ?? "",
    DEVICE_STATUS_LABEL[row.status].toLowerCase(),
    row.status.replace(/_/g, " "),
    row.sim?.iccid ?? "",
    row.sim?.msisdn ?? "",
    row.assignedCustomer?.displayName ?? "",
    DEVICE_USAGE_PURPOSE_LABEL[row.usagePurpose].toLowerCase(),
    ...row.tags,
  ];
  const haystack = parts.join(" ").toLowerCase();
  return haystack.includes(q);
}

export function mapDeviceToListRow(device: {
  id: string;
  label: string | null;
  imei: string;
  serialNumber: string | null;
  firmwareVersion: string | null;
  status: DeviceStatus;
  usagePurpose: DeviceUsagePurpose;
  tags: string[];
  deviceModel: { name: string; manufacturer: string | null };
  simCard: {
    id: string;
    iccid: string;
    msisdn: string | null;
    lastSyncedAt: Date | null;
  } | null;
  serviceAssignments: {
    customer: {
      id: string;
      company: string | null;
      firstName: string | null;
      lastName: string | null;
    };
  }[];
}): DeviceListRow {
  const assignment = device.serviceAssignments[0];
  const customer = assignment?.customer;
  return {
    id: device.id,
    label: device.label,
    imei: device.imei,
    serialNumber: device.serialNumber,
    firmwareVersion: device.firmwareVersion,
    status: device.status,
    usagePurpose: device.usagePurpose,
    tags: device.tags ?? [],
    deviceModel: {
      name: device.deviceModel.name,
      manufacturer: device.deviceModel.manufacturer,
    },
    modelInitials: modelInitials(device.deviceModel.manufacturer, device.deviceModel.name),
    sim: device.simCard
      ? {
          id: device.simCard.id,
          iccid: device.simCard.iccid,
          msisdn: device.simCard.msisdn,
          lastSyncedAt: device.simCard.lastSyncedAt,
        }
      : null,
    assignedCustomer: customer
      ? {
          id: customer.id,
          displayName: customerDisplayName(customer),
          initials: customerInitials(customer),
        }
      : null,
  };
}
