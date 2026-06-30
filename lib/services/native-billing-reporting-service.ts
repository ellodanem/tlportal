import "server-only";

import type { InvoiceStatus, PaymentMethod } from "@prisma/client";

import type { ArAgingBucket } from "@/lib/domain/billing-reports";
import { monthRangeUtc } from "@/lib/domain/expenses";
import { round2 } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";
import { expenseMonthlyTotals } from "@/lib/services/expense-service";

const OPEN_AR_STATUSES: InvoiceStatus[] = ["open", "partially_paid", "overdue"];

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysOverdue(dueDate: Date | null, asOf: Date): number {
  if (!dueDate) return 0;
  const due = startOfUtcDay(dueDate);
  const today = startOfUtcDay(asOf);
  if (due >= today) return 0;
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

export function arAgingBucketForInvoice(dueDate: Date | null, asOf: Date): ArAgingBucket {
  const overdue = daysOverdue(dueDate, asOf);
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "days_1_30";
  if (overdue <= 60) return "days_31_60";
  if (overdue <= 90) return "days_61_90";
  return "days_90_plus";
}

export type ArAgingInvoiceRow = {
  invoiceId: string;
  number: string | null;
  customerLabel: string;
  dueDate: Date | null;
  amountDue: number;
  currency: string;
  status: InvoiceStatus;
  bucket: ArAgingBucket;
};

export type ArAgingReport = {
  asOf: Date;
  buckets: Record<ArAgingBucket, { total: number; count: number }>;
  totalOutstanding: number;
  invoices: ArAgingInvoiceRow[];
};

export async function getArAgingReport(asOf = new Date()): Promise<ArAgingReport> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: OPEN_AR_STATUSES },
      amountDue: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      number: true,
      billToName: true,
      billToLines: true,
      dueDate: true,
      amountDue: true,
      currency: true,
      status: true,
      customer: { select: { company: true, firstName: true, lastName: true } },
    },
  });

  const buckets: ArAgingReport["buckets"] = {
    current: { total: 0, count: 0 },
    days_1_30: { total: 0, count: 0 },
    days_31_60: { total: 0, count: 0 },
    days_61_90: { total: 0, count: 0 },
    days_90_plus: { total: 0, count: 0 },
  };

  let totalOutstanding = 0;
  const rows: ArAgingInvoiceRow[] = [];

  for (const inv of invoices) {
    const amountDue = round2(Number(inv.amountDue));
    if (amountDue <= 0) continue;

    const bucket = arAgingBucketForInvoice(inv.dueDate, asOf);
    buckets[bucket].total = round2(buckets[bucket].total + amountDue);
    buckets[bucket].count += 1;
    totalOutstanding = round2(totalOutstanding + amountDue);

    const customerLabel =
      inv.billToName?.trim() ||
      (inv.billToLines[0]?.trim() ?? "") ||
      [inv.customer?.company, inv.customer?.firstName, inv.customer?.lastName].filter(Boolean).join(" ") ||
      "—";

    rows.push({
      invoiceId: inv.id,
      number: inv.number,
      customerLabel,
      dueDate: inv.dueDate,
      amountDue,
      currency: inv.currency,
      status: inv.status,
      bucket,
    });
  }

  return { asOf, buckets, totalOutstanding, invoices: rows };
}

export type MonthlyRevenueReport = {
  total: number;
  paymentCount: number;
  byMethod: { method: PaymentMethod; total: number; count: number }[];
};

export async function getMonthlyRevenueReport(year: number, month: number): Promise<MonthlyRevenueReport> {
  const { start, end } = monthRangeUtc(year, month);
  const payments = await prisma.payment.findMany({
    where: { voidedAt: null, receivedAt: { gte: start, lt: end } },
    select: { amount: true, method: true },
  });

  const byMethodMap = new Map<PaymentMethod, { total: number; count: number }>();
  let total = 0;

  for (const p of payments) {
    const amt = round2(Number(p.amount));
    total = round2(total + amt);
    const existing = byMethodMap.get(p.method) ?? { total: 0, count: 0 };
    existing.total = round2(existing.total + amt);
    existing.count += 1;
    byMethodMap.set(p.method, existing);
  }

  const byMethod = [...byMethodMap.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.total - a.total);

  return { total, paymentCount: payments.length, byMethod };
}

export type BillingMonthlyReport = {
  year: number;
  month: number;
  revenue: MonthlyRevenueReport;
  expenses: Awaited<ReturnType<typeof expenseMonthlyTotals>>;
  netCashFlow: number;
  arAging: ArAgingReport;
};

export async function getBillingMonthlyReport(year: number, month: number): Promise<BillingMonthlyReport> {
  const [revenue, expenses, arAging] = await Promise.all([
    getMonthlyRevenueReport(year, month),
    expenseMonthlyTotals(year, month),
    getArAgingReport(new Date()),
  ]);

  return {
    year,
    month,
    revenue,
    expenses,
    netCashFlow: round2(revenue.total - expenses.total),
    arAging,
  };
}
