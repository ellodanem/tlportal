import { notFound } from "next/navigation";

import { CustomerActivityPanel } from "@/components/admin/customer-activity-panel";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { CustomerWorkspaceHeader } from "@/components/admin/customer-workspace-header";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerActivityPage({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, company: true, firstName: true, lastName: true, email: true, phone: true, tags: true, archivedAt: true },
  });
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-6">
      <CustomerWorkspaceHeader customer={customer} />
      <CustomerSubnav customerId={customer.id} active="activity" />
      <CustomerActivityPanel customerId={customer.id} />
    </div>
  );
}
