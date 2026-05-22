import type { BroadcastTemplateCategory } from "@prisma/client";

const CATEGORY_LABELS: Record<BroadcastTemplateCategory, string> = {
  outage: "Outage",
  maintenance: "Maintenance",
  general: "General",
  billing: "Billing",
};

export function broadcastCategoryLabel(category: BroadcastTemplateCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

export const BROADCAST_CATEGORY_OPTIONS: { value: BroadcastTemplateCategory; label: string }[] = [
  { value: "outage", label: "Outage" },
  { value: "maintenance", label: "Maintenance" },
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
];

export function parseBroadcastCategory(raw: FormDataEntryValue | null): BroadcastTemplateCategory {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v === "outage" || v === "maintenance" || v === "general" || v === "billing") {
    return v;
  }
  return "general";
}
