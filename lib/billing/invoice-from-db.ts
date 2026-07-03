import "server-only";

import { buildNativeInvoicePdfBuffer } from "@/lib/billing/native-invoice-pdf";
import { prisma } from "@/lib/db";
import { loadPdfHeaderLogo } from "@/lib/proposals/pdf-header-logo";

export async function buildInvoicePdfFromInvoiceId(
  invoiceId: string,
): Promise<{ buffer: Buffer; filename: string } | { error: string }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) return { error: "Invoice not found." };
  if (!invoice.lineItems.length) return { error: "Invoice has no line items." };

  const headerLogo = await loadPdfHeaderLogo();

  const buffer = buildNativeInvoicePdfBuffer({
    invoiceNumber: invoice.number ?? "Draft",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    billToLines: invoice.billToLines.length ? invoice.billToLines : [invoice.billToName ?? "Customer"],
    lineItems: invoice.lineItems.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    })),
    subtotal: Number(invoice.subtotal),
    discountTotal: Number(invoice.discountTotal),
    taxLabel: invoice.taxLabel,
    taxTotal: Number(invoice.taxTotal),
    total: Number(invoice.total),
    amountPaid: Number(invoice.amountPaid),
    amountDue: Number(invoice.amountDue),
    notes: invoice.notes,
    paymentInstructions: invoice.paymentInstructions,
    isPaid: invoice.status === "paid",
    headerLogo,
  });

  const slug = (invoice.number ?? invoice.id.slice(0, 8)).replace(/[^\w.-]+/g, "_");
  return { buffer, filename: `invoice-${slug}.pdf` };
}

export async function loadInvoiceByPublicToken(token: string) {
  return prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { where: { voidedAt: null }, orderBy: { receivedAt: "desc" } },
    },
  });
}
