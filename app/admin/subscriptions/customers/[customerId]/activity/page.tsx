import { notFound } from "next/navigation";

import { CustomerActivityPanel } from "@/components/admin/customer-activity-panel";
import { prisma } from "@/lib/db";

export default async function CustomerWorkspaceActivityPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-5">
      <CustomerActivityPanel customerId={customer.id} />
    </div>
  );
}
