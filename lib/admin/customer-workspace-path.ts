/**
 * Route map for the customer workspace inside the Subscriptions area:
 * `/admin/subscriptions/customers/[customerId]/{billing,statements,messages,activity}`.
 *
 * The original Customers workspace (`/admin/customers/[id]/...`) still exists while it is being
 * retired, so server actions that change data shown here must revalidate BOTH paths.
 */

export const CUSTOMER_WORKSPACE_TABS = [
  { key: "billing", label: "Billing" },
  { key: "statements", label: "Statements" },
  { key: "messages", label: "Messages" },
  { key: "activity", label: "Activity" },
] as const;

export type CustomerWorkspaceTabKey = (typeof CUSTOMER_WORKSPACE_TABS)[number]["key"];

export function customerWorkspacePath(customerId: string, tab: CustomerWorkspaceTabKey): string {
  return `/admin/subscriptions/customers/${encodeURIComponent(customerId)}/${tab}`;
}

/** Maps the first child segment under the customer layout to its tab (billing by default). */
export function activeCustomerWorkspaceTab(segment: string | null | undefined): CustomerWorkspaceTabKey {
  return CUSTOMER_WORKSPACE_TABS.find((tab) => tab.key === segment)?.key ?? "billing";
}

/** The retired Customers-workspace path for the same tab, kept only while those pages exist. */
export function legacyCustomerTabPath(customerId: string, tab: Exclude<CustomerWorkspaceTabKey, "billing">): string {
  return `/admin/customers/${customerId}/${tab}`;
}
