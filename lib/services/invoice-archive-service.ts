import "server-only";

import { prisma } from "@/lib/db";

import { recordOperationalEvent } from "./operational-event-service";

export type ArchiveInvoiceResult = { ok: true } | { ok: false; error: string };

export async function archiveInvoice(
  invoiceId: string,
  actorUserId?: string | null,
): Promise<ArchiveInvoiceResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      archivedAt: true,
      customerId: true,
      billToName: true,
    },
  });
  if (!invoice) {
    return { ok: false, error: "Invoice not found." };
  }
  if (invoice.archivedAt) {
    return { ok: false, error: "Invoice is already archived." };
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { archivedAt: new Date() },
  });

  await recordOperationalEvent({
    category: "invoice.archived",
    summary: "Invoice archived",
    customerId: invoice.customerId,
    actorUserId: actorUserId ?? undefined,
    payload: { invoiceId, number: invoice.number, billToName: invoice.billToName },
  });

  return { ok: true };
}

export async function unarchiveInvoice(
  invoiceId: string,
  actorUserId?: string | null,
): Promise<ArchiveInvoiceResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      archivedAt: true,
      customerId: true,
      billToName: true,
    },
  });
  if (!invoice) {
    return { ok: false, error: "Invoice not found." };
  }
  if (!invoice.archivedAt) {
    return { ok: false, error: "Invoice is not archived." };
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { archivedAt: null },
  });

  await recordOperationalEvent({
    category: "invoice.unarchived",
    summary: "Invoice restored from archive",
    customerId: invoice.customerId,
    actorUserId: actorUserId ?? undefined,
    payload: { invoiceId, number: invoice.number, billToName: invoice.billToName },
  });

  return { ok: true };
}
