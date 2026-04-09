import type { DeviceUsagePurpose } from "@prisma/client";

/** List / SIM table scope: default hides non-customer hardware. */
export type DevicePurposeScope = "all" | "customer_only" | "include_all" | "internal_only";

export const DEVICE_PURPOSE_SCOPE_LABEL: Record<DevicePurposeScope, string> = {
  all: "All",
  customer_only: "Production only",
  include_all: "Include internal / demo",
  internal_only: "Internal / non-production only",
};

/** Short UI labels for enum values. */
export const DEVICE_USAGE_PURPOSE_LABEL: Record<DeviceUsagePurpose, string> = {
  customer: "Production",
  internal_demo: "Internal demo",
  field_test: "Field test",
  personal: "Personal",
};

/** Compact badge text for non-customer rows (customer is usually unbadged). */
export const DEVICE_USAGE_PURPOSE_BADGE: Record<DeviceUsagePurpose, string | null> = {
  customer: null,
  internal_demo: "Demo",
  field_test: "Field test",
  personal: "Personal",
};

export function isCustomerPurpose(purpose: DeviceUsagePurpose): boolean {
  return purpose === "customer";
}

export function devicePurposeMatchesScope(
  purpose: DeviceUsagePurpose,
  scope: DevicePurposeScope,
): boolean {
  if (scope === "all" || scope === "include_all") return true;
  const isCustomer = isCustomerPurpose(purpose);
  if (scope === "customer_only") return isCustomer;
  return !isCustomer;
}

/**
 * SIM rows inherit purpose from the linked device. Unlinked SIMs are treated like
 * inventory: visible in production scope, hidden in internal-only scope.
 */
export function simPurposeMatchesScope(
  deviceUsagePurpose: DeviceUsagePurpose | null,
  scope: DevicePurposeScope,
): boolean {
  if (scope === "all" || scope === "include_all") return true;
  if (deviceUsagePurpose === null) {
    return scope === "customer_only";
  }
  return devicePurposeMatchesScope(deviceUsagePurpose, scope);
}

const PURPOSE_VALUES = new Set<string>(["customer", "internal_demo", "field_test", "personal"]);

export function parseDeviceUsagePurpose(raw: string | undefined): DeviceUsagePurpose {
  const v = String(raw ?? "").trim();
  if (PURPOSE_VALUES.has(v)) return v as DeviceUsagePurpose;
  return "customer";
}

/** Parse comma/semicolon/newline-separated tags; trim, drop empties, cap count. */
export function parseDeviceTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 50) break;
  }
  return out;
}
