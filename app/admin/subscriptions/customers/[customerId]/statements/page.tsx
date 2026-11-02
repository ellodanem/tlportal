import { notFound } from "next/navigation";

import { CustomerStatementsPanel } from "@/components/admin/customer-statements-panel";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerWorkspacePath } from "@/lib/admin/customer-workspace-path";
import { prisma } from "@/lib/db";

type Props = {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
};

export default async function CustomerWorkspaceStatementsPage({ params, searchParams }: Props) {
  const { customerId } = await params;
  const sp = await searchParams;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, company: true, firstName: true, lastName: true, archivedAt: true },
  });
  if (!customer || customer.archivedAt) notFound();

  return (
    <div className="flex flex-col gap-5">
      <CustomerStatementsPanel
        customerId={customer.id}
        customerName={customerDisplayName(customer)}
        basePath={customerWorkspacePath(customer.id, "statements")}
        searchParams={sp}
      />
    </div>
  );
}
