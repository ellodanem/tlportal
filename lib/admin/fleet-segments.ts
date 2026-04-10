/** Dashboard fleet donut — mutually exclusive buckets across all devices. */
export type FleetSegmentKey = "unassigned" | "production" | "demo" | "personal";

export const FLEET_SEGMENT_ORDER: FleetSegmentKey[] = [
  "unassigned",
  "production",
  "demo",
  "personal",
];

export const FLEET_SEGMENT_META: Record<
  FleetSegmentKey,
  { label: string; description: string; color: string }
> = {
  unassigned: {
    label: "Unassigned",
    description: "Production inventory (in stock)",
    color: "#a1a1aa",
  },
  production: {
    label: "Production",
    description: "Customer units not in warehouse",
    color: "#059669",
  },
  demo: {
    label: "Demo / field test",
    description: "Internal demo and field-test hardware",
    color: "#7c3aed",
  },
  personal: {
    label: "Personal",
    description: "Personal-purpose devices",
    color: "#0891b2",
  },
};
