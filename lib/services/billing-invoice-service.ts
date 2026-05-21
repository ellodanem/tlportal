import "server-only";

import { prisma } from "@/lib/db";

export async function listBillingInvoicesForCustomer(customerId: string, limit = 24) {
  return prisma.billingInvoice.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
