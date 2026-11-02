import { notFound } from "next/navigation";

import { CustomerMessagesPanel } from "@/components/admin/customer-messages-panel";
import { prisma } from "@/lib/db";

export default async function CustomerWorkspaceMessagesPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, phone: true } });
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-5">
      <CustomerMessagesPanel customer={customer} />
    </div>
  );
}
