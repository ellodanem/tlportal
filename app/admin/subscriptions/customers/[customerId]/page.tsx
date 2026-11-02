import { redirect } from "next/navigation";

import { customerWorkspacePath } from "@/lib/admin/customer-workspace-path";

/** The customer workspace opens on Billing. */
export default async function CustomerWorkspaceIndex({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  redirect(customerWorkspacePath(customerId, "billing"));
}
