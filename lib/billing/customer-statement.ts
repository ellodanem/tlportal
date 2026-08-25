import "server-only";

import type { InvoiceStatus, PaymentMethod } from "@prisma/client";

import { activeInvoiceWhere } from "@/lib/admin/active-invoice-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { addDaysToYmd, atlanticTodayYmd, sendAtFromAtlanticDateYmd } from "@/lib/billing/atlantic-date";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { displayInvoiceNumber } from "@/lib/domain/native-billing-cutover";
import { formatMoney, PAYMENT_METHOD_LABELS, round2 } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const EXCLUDED_INVOICE_STATUSES: InvoiceStatus[] = ["draft", "void", "written_off"];

export type StatementActivityKind = "invoice" | "payment";

export type StatementActivityRow = {
  kind: StatementActivityKind;
  date: Date;
  reference: string;
  description: string;
  charge: number;
  credit: number;
  invoiceId?: string;
  paymentId?: string;
};

export type StatementOutstandingRow = {
  invoiceId: string;
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  amountDue: number;
  currency: string;
};

export type CustomerStatement = {
  customerId: string;
  customerName: string;
  billToLines: string[];
  currency: string;
  periodFrom: string;
  periodTo: string;
  generatedAt: Date;
  openingBalance: number;
  periodCharges: number;
  periodCredits: number;
  closingBalance: number;
  activity: StatementActivityRow[];
  outstanding: StatementOutstandingRow[];
};

export type StatementPeriodPreset = "this_month" | "last_month" | "this_year" | "custom";

export function formatStatementYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/St_Lucia" });
}

export function formatStatementLabel(ymd: string): string {
  const parsed = sendAtFromAtlanticDateYmd(ymd);
  if ("error" in parsed) return ymd;
  return parsed.toLocaleDateString("en-029", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/St_Lucia",
  });
}

function atlanticMonthStartYmd(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function atlanticMonthEndYmd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0));
  return lastDay.toISOString().slice(0, 10);
}

/** Resolve from/to YMD for a preset or explicit dates (Atlantic calendar). */
export function resolveStatementPeriod(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}): { from: string; to: string; preset: StatementPeriodPreset } {
  const today = atlanticTodayYmd();
  const [y, m] = today.split("-").map(Number);
  const presetRaw = input.preset?.trim() as StatementPeriodPreset | undefined;

  if (presetRaw === "this_month") {
    return { from: atlanticMonthStartYmd(y, m), to: today, preset: "this_month" };
  }
  if (presetRaw === "last_month") {
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    return {
      from: atlanticMonthStartYmd(prevYear, prevMonth),
      to: atlanticMonthEndYmd(prevYear, prevMonth),
      preset: "last_month",
    };
  }
  if (presetRaw === "this_year") {
    return { from: `${y}-01-01`, to: today, preset: "this_year" };
  }

  const from = input.from?.trim() || atlanticMonthStartYmd(y, m);
  const to = input.to?.trim() || today;
  return { from, to, preset: "custom" };
}

export function validateStatementPeriod(from: string, to: string): string | null {
  if (!YMD_RE.test(from) || !YMD_RE.test(to)) {
    return "Enter valid from and to dates.";
  }
  if (from > to) {
    return "From date must be on or before to date.";
  }
  return null;
}

function atlanticRangeBounds(fromYmd: string, toYmd: string): { start: Date; endExclusive: Date } | { error: string } {
  const start = sendAtFromAtlanticDateYmd(fromYmd);
  if ("error" in start) return start;
  const endDay = addDaysToYmd(toYmd, 1);
  const endExclusive = sendAtFromAtlanticDateYmd(endDay);
  if ("error" in endExclusive) return endExclusive;
  return { start, endExclusive };
}

function paymentDescription(method: PaymentMethod, reference: string | null, invoiceNumber: string | null): string {
  const methodLabel = PAYMENT_METHOD_LABELS[method] ?? method;
  const parts = [`Payment — ${methodLabel}`];
  if (invoiceNumber) parts.push(invoiceNumber);
  if (reference?.trim()) parts.push(reference.trim());
  return parts.join(" · ");
}

export async function buildCustomerStatement(input: {
  customerId: string;
  from: string;
  to: string;
}): Promise<CustomerStatement | { error: string }> {
  const periodError = validateStatementPeriod(input.from, input.to);
  if (periodError) return { error: periodError };

  const bounds = atlanticRangeBounds(input.from, input.to);
  if ("error" in bounds) return bounds;

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      archivedAt: true,
    },
  });
  if (!customer) return { error: "Customer not found." };
  if (customer.archivedAt) return { error: "Customer is archived." };

  const invoiceWhere = {
    ...activeInvoiceWhere,
    customerId: input.customerId,
    status: { notIn: EXCLUDED_INVOICE_STATUSES },
  };

  const [prePeriodInvoices, periodInvoices, periodPayments, outstandingInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...invoiceWhere,
        issueDate: { lt: bounds.start },
        amountDue: { gt: 0 },
      },
      select: {
        id: true,
        number: true,
        legacyInvoiceNumber: true,
        issueDate: true,
        dueDate: true,
        total: true,
        amountDue: true,
        currency: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        ...invoiceWhere,
        issueDate: { gte: bounds.start, lt: bounds.endExclusive },
      },
      select: {
        id: true,
        number: true,
        legacyInvoiceNumber: true,
        issueDate: true,
        total: true,
        currency: true,
      },
      orderBy: { issueDate: "asc" },
    }),
    prisma.payment.findMany({
      where: {
        customerId: input.customerId,
        voidedAt: null,
        receivedAt: { gte: bounds.start, lt: bounds.endExclusive },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        reference: true,
        receivedAt: true,
        invoice: { select: { number: true, legacyInvoiceNumber: true } },
      },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.invoice.findMany({
      where: {
        ...invoiceWhere,
        amountDue: { gt: 0 },
      },
      select: {
        id: true,
        number: true,
        legacyInvoiceNumber: true,
        issueDate: true,
        dueDate: true,
        amountDue: true,
        currency: true,
      },
      orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
    }),
  ]);

  const currency =
    periodInvoices[0]?.currency ??
    periodPayments[0]?.currency ??
    prePeriodInvoices[0]?.currency ??
    outstandingInvoices[0]?.currency ??
    "XCD";

  const openingBalance = round2(
    prePeriodInvoices.reduce((sum, inv) => sum + Number(inv.amountDue), 0),
  );

  const activity: StatementActivityRow[] = [];

  for (const inv of periodInvoices) {
    const number = displayInvoiceNumber(inv);
    const charge = round2(Number(inv.total));
    activity.push({
      kind: "invoice",
      date: inv.issueDate,
      reference: number,
      description: `Invoice ${number}`,
      charge,
      credit: 0,
      invoiceId: inv.id,
    });
  }

  for (const pay of periodPayments) {
    const credit = round2(Number(pay.amount));
    const invNum = pay.invoice ? displayInvoiceNumber(pay.invoice) : null;
    activity.push({
      kind: "payment",
      date: pay.receivedAt,
      reference: invNum ?? "Payment",
      description: paymentDescription(pay.method, pay.reference, invNum),
      charge: 0,
      credit,
      paymentId: pay.id,
    });
  }

  activity.sort((a, b) => {
    const t = a.date.getTime() - b.date.getTime();
    if (t !== 0) return t;
    if (a.kind === b.kind) return 0;
    return a.kind === "invoice" ? -1 : 1;
  });

  const periodCharges = round2(activity.reduce((sum, row) => sum + row.charge, 0));
  const periodCredits = round2(activity.reduce((sum, row) => sum + row.credit, 0));
  const closingBalance = round2(openingBalance + periodCharges - periodCredits);

  const outstanding: StatementOutstandingRow[] = outstandingInvoices.map((inv) => ({
    invoiceId: inv.id,
    number: displayInvoiceNumber(inv),
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    amountDue: round2(Number(inv.amountDue)),
    currency: inv.currency,
  }));

  return {
    customerId: customer.id,
    customerName: customerDisplayName(customer),
    billToLines: customerBillToLines(customer),
    currency,
    periodFrom: input.from,
    periodTo: input.to,
    generatedAt: new Date(),
    openingBalance,
    periodCharges,
    periodCredits,
    closingBalance,
    activity,
    outstanding,
  };
}

export function statementPdfFilename(customerName: string, from: string, to: string): string {
  const slug = customerName
    .toLowerCase()
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `statement-${slug || "customer"}-${from}-${to}.pdf`;
}

export { formatMoney };
