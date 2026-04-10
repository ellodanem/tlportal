import type { DeviceObjectType } from "@prisma/client";

/** Display order in selects (add new enum values here when extending the schema). */
export const DEVICE_OBJECT_TYPE_ORDER: DeviceObjectType[] = [
  "car",
  "bike",
  "ambulance",
  "fire_truck",
  "atv",
  "boat",
  "container",
  "bus",
  "garbage_truck",
  "jet_ski",
  "speed_boat",
];

export const DEVICE_OBJECT_TYPE_LABEL: Record<DeviceObjectType, string> = {
  car: "Car",
  bike: "Bike",
  ambulance: "Ambulance",
  fire_truck: "Fire truck",
  atv: "ATV",
  boat: "Boat",
  container: "Container",
  bus: "Bus",
  garbage_truck: "Garbage truck",
  jet_ski: "Jet ski",
  speed_boat: "Speed boat",
};

const VALUES = new Set<string>(DEVICE_OBJECT_TYPE_ORDER);

export function parseDeviceObjectType(raw: string | undefined): DeviceObjectType | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (VALUES.has(v)) return v as DeviceObjectType;
  return null;
}
