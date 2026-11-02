import { customerWorkspacePath } from "@/lib/admin/customer-workspace-path";

/**
 * Single source of truth for the customer billing route.
 *
 * Customer billing lives in the Subscriptions area. The original
 * `/admin/customers/[id]/billing` URL is kept only as a permanent redirect so old bookmarks,
 * emails and WhatsApp alerts keep working. A test fails if any source file still links to or
 * revalidates the old path, so new code must use this path.
 */

export type CustomerBillingAnchor = "recent-invoices" | "provider-invoices" | "billing-settings";

export function customerBillingPath(customerId: string, anchor?: CustomerBillingAnchor): string {
  const base = customerWorkspacePath(customerId, "billing");
  return anchor ? `${base}#${anchor}` : base;
}
