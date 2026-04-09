import type { DeviceStatus } from "@prisma/client";

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  in_stock: "In stock",
  assigned: "Assigned",
  suspended: "Suspended",
  returned: "Returned",
  decommissioned: "Decommissioned",
  lost: "Lost",
};
