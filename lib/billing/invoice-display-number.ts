import "server-only";

import { prisma } from "@/lib/db";

import { allocateInvoiceSequenceValue, formatDisplayNumber } from "./invoice-sequence";

const ALLOCATE_STATUSES = new Set(["open", "paid"]);

/**
 * Assign `TL-INV-{n}` when Stripe invoice is finalized or paid (idempotent).
 */
export async function ensureBillingInvoiceDisplayNumber(billingInvoiceId: string): Promise<string | null> {
  const row = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    select: { displayNumber: true, status: true },
  });
  if (!row) return null;
  if (row.displayNumber) return row.displayNumber;
  if (!ALLOCATE_STATUSES.has(row.status.toLowerCase())) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.billingInvoice.findUnique({
      where: { id: billingInvoiceId },
      select: { displayNumber: true, status: true },
    });
    if (!locked) return null;
    if (locked.displayNumber) return locked.displayNumber;
    if (!ALLOCATE_STATUSES.has(locked.status.toLowerCase())) {
      return null;
    }

    const serial = await allocateInvoiceSequenceValue(tx);
    const displayNumber = formatDisplayNumber(serial);
    await tx.billingInvoice.update({
      where: { id: billingInvoiceId },
      data: { displayNumber },
    });
    return displayNumber;
  });
}
