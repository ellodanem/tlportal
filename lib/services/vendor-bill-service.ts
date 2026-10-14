import "server-only";

import type { ExpensePaymentMethod, VendorBillStatus } from "@prisma/client";

import { round2, toMoneyString } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

export type VendorBillInput = {
  vendorId: string;
  vendorInvoiceNumber?: string | null;
  description?: string | null;
  currency?: string;
  total: number;
  billDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  createdById?: string | null;
  status?: "draft" | "open";
};

export function effectiveVendorBillStatus(bill: { status: VendorBillStatus; amountDue: unknown; dueDate: Date | null }): VendorBillStatus {
  if (bill.status === "open" || bill.status === "partially_paid" || bill.status === "overdue") {
    if (Number(bill.amountDue) > 0 && bill.dueDate && bill.dueDate.getTime() < Date.now()) return "overdue";
  }
  return bill.status;
}

export async function createVendorBill(input: VendorBillInput): Promise<string> {
  if (!(input.total > 0)) throw new Error("Bill total must be greater than zero.");
  const created = await prisma.vendorBill.create({
    data: {
      vendorId: input.vendorId,
      vendorInvoiceNumber: input.vendorInvoiceNumber ?? null,
      description: input.description ?? null,
      currency: (input.currency ?? "XCD").toUpperCase(),
      total: toMoneyString(input.total),
      amountPaid: toMoneyString(0),
      amountDue: toMoneyString(input.total),
      billDate: input.billDate,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
      status: input.status ?? "draft",
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateVendorBill(billId: string, input: VendorBillInput): Promise<void> {
  if (!(input.total > 0)) throw new Error("Bill total must be greater than zero.");
  const existing = await prisma.vendorBill.findUnique({ where: { id: billId }, select: { status: true, amountPaid: true } });
  if (!existing) throw new Error("Bill not found.");
  if (existing.status !== "draft") throw new Error("Only draft bills can be edited.");
  const amountDue = round2(input.total - Number(existing.amountPaid));
  if (amountDue < 0) throw new Error("Bill total cannot be less than payments already recorded.");
  await prisma.vendorBill.update({
    where: { id: billId },
    data: {
      vendorId: input.vendorId,
      vendorInvoiceNumber: input.vendorInvoiceNumber ?? null,
      description: input.description ?? null,
      currency: (input.currency ?? "XCD").toUpperCase(),
      total: toMoneyString(input.total),
      amountDue: toMoneyString(amountDue),
      billDate: input.billDate,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "draft",
    },
  });
}

export async function recordVendorBillPayment(input: {
  billId: string;
  amount: number;
  method: ExpensePaymentMethod;
  reference?: string | null;
  notes?: string | null;
  paidAt?: Date;
  recordedById?: string | null;
}) {
  if (!(input.amount > 0)) throw new Error("Payment amount must be greater than zero.");
  return prisma.$transaction(async (tx) => {
    const bill = await tx.vendorBill.findUnique({ where: { id: input.billId }, select: { id: true, total: true, dueDate: true, currency: true, status: true } });
    if (!bill) throw new Error("Bill not found.");
    if (bill.status === "draft" || bill.status === "void") throw new Error("Open the bill before recording a payment.");

    const payment = await tx.vendorBillPayment.create({
      data: {
        billId: bill.id,
        amount: toMoneyString(input.amount),
        currency: bill.currency,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        paidAt: input.paidAt ?? new Date(),
        recordedById: input.recordedById ?? null,
      },
      select: { id: true },
    });
    const aggregate = await tx.vendorBillPayment.aggregate({ where: { billId: bill.id, voidedAt: null }, _sum: { amount: true } });
    const amountPaid = round2(Number(aggregate._sum.amount ?? 0));
    const total = round2(Number(bill.total));
    const amountDue = round2(total - amountPaid);
    const status: VendorBillStatus = amountDue <= 0 ? "paid" : amountPaid > 0 ? "partially_paid" : bill.dueDate && bill.dueDate.getTime() < Date.now() ? "overdue" : "open";
    await tx.vendorBill.update({ where: { id: bill.id }, data: { amountPaid: toMoneyString(amountPaid), amountDue: toMoneyString(Math.max(0, amountDue)), status } });
    return { paymentId: payment.id, status, amountPaid, amountDue: Math.max(0, amountDue) };
  });
}

export async function voidVendorBill(billId: string): Promise<void> {
  const bill = await prisma.vendorBill.findUnique({ where: { id: billId }, select: { status: true } });
  if (!bill) throw new Error("Bill not found.");
  if (bill.status === "paid" || bill.status === "partially_paid") throw new Error("Paid bills cannot be voided.");
  await prisma.vendorBill.update({ where: { id: billId }, data: { status: "void" } });
}
