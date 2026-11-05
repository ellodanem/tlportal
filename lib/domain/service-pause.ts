import type { ServiceAssignmentPauseReason } from "@prisma/client";

export type { ServiceAssignmentPauseReason };

export const SERVICE_PAUSE_REASON_LABEL: Record<ServiceAssignmentPauseReason, string> = {
  accident: "Accident / vehicle unavailable",
  no_vehicle: "No vehicle to install",
  seasonal: "Seasonal pause",
  delinquent: "Billing / delinquency",
  other: "Other",
};

export const SERVICE_PAUSE_REASONS = Object.keys(SERVICE_PAUSE_REASON_LABEL) as ServiceAssignmentPauseReason[];

export type ServicePauseDeviceDisposition = "returned" | "in_stock" | "left_in_vehicle";

export const SERVICE_PAUSE_DISPOSITION_LABEL: Record<ServicePauseDeviceDisposition, string> = {
  returned: "Returned to TL (customer unit in storage)",
  in_stock: "In stock (pooled inventory)",
  left_in_vehicle: "Left in vehicle (not removed)",
};

/** Short phrase for confirmation messages, e.g. "tracker marked returned". */
export const SERVICE_PAUSE_DISPOSITION_OUTCOME: Record<ServicePauseDeviceDisposition, string> = {
  returned: "marked returned",
  in_stock: "marked in stock",
  left_in_vehicle: "left in the vehicle",
};

export function parseServicePauseReason(raw: string): ServiceAssignmentPauseReason | null {
  const v = raw.trim() as ServiceAssignmentPauseReason;
  return SERVICE_PAUSE_REASONS.includes(v) ? v : null;
}

export function parseServicePauseDisposition(raw: string): ServicePauseDeviceDisposition | null {
  const v = raw.trim() as ServicePauseDeviceDisposition;
  return v === "returned" || v === "in_stock" || v === "left_in_vehicle" ? v : null;
}
