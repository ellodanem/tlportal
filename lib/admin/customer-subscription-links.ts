import {
  canonicalIntervalLabel,
  canonicalSubscriptionDisplayName,
  canonicalSubscriptionUiVisible,
} from "@/lib/domain/canonical-subscription-admin";

export type CustomerSubscriptionRow = {
  id: string;
  name: string | null;
  billingIntervalMonths: number | null;
  lifecycleStatus: string | null;
  nextBillingDate: Date | null;
};

export type CustomerSubscriptionLink = {
  id: string;
  label: string;
  interval: string;
  /** Next renewal as a display date, or an empty string when none is scheduled. */
  renews: string;
};

/**
 * Links to a customer's canonical subscription workspaces. Rows with no lifecycle status are
 * legacy agreements with no subscription workspace, so they are not linked. Returns nothing when
 * the canonical subscription UI is not visible in this environment.
 */
export function canonicalSubscriptionLinks(rows: CustomerSubscriptionRow[]): CustomerSubscriptionLink[] {
  if (!canonicalSubscriptionUiVisible()) return [];
  return rows
    .filter((row) => row.lifecycleStatus != null)
    .map((row) => ({
      id: row.id,
      label: canonicalSubscriptionDisplayName(row.name, row.billingIntervalMonths),
      interval: canonicalIntervalLabel(row.billingIntervalMonths),
      renews: row.nextBillingDate?.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) ?? "",
    }));
}
