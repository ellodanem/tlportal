import Link from "next/link";
import { notFound } from "next/navigation";

import { RecurringScheduleActions } from "@/components/admin/recurring-schedule-actions";
import {
  RecurringScheduleForm,
  type RecurringCustomerOption,
  type RecurringScheduleFormInitial,
} from "@/components/admin/recurring-schedule-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { formatMoney, RECURRING_SCHEDULE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function RecurringInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [schedule, customers, generated] = await Promise.all([
    prisma.recurringInvoiceSchedule.findUnique({
      where: { id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.customer.findMany({
      where: activeCustomerWhere,
      orderBy: [{ company: "asc" }, { lastName: "asc" }],
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
      },
    }),
    prisma.invoice.findMany({
      where: { recurringScheduleId: id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, number: true, status: true, total: true, currency: true, issueDate: true },
    }),
  ]);

  if (!schedule) notFound();

  const customerOptions: RecurringCustomerOption[] = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    email: c.email?.trim() || null,
    billToLines: customerBillToLines(c),
  }));

  const initial: RecurringScheduleFormInitial = {
    scheduleId: schedule.id,
    status: schedule.status,
    name: schedule.name ?? "",
    customerId: schedule.customerId,
    clientName: schedule.customerId ? "" : (schedule.billToName ?? ""),
    currency: schedule.currency,
    notes: schedule.notes ?? "",
    paymentInstructions: schedule.paymentInstructions ?? "",
    intervalMonths: schedule.intervalMonths,
    nextIssueDate: formatYmd(schedule.nextIssueDate),
    dueDaysAfterIssue: schedule.dueDaysAfterIssue,
    autoEmail: schedule.autoEmail,
    emailTo: schedule.emailTo ?? "",
    lines: schedule.lineItems.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    })),
  };

  const readOnly = schedule.status === "ended";
  const cycleTotal = schedule.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/recurring-invoices"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Recurring invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {schedule.name?.trim() || "Recurring schedule"}
          </h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium dark:bg-zinc-800">
            {RECURRING_SCHEDULE_STATUS_LABELS[schedule.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {formatMoney(cycleTotal, schedule.currency)} per cycle · Next issue {formatYmd(schedule.nextIssueDate)}
          {schedule.lastGeneratedAt
            ? ` · Last run ${schedule.lastGeneratedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
        </p>
      </div>

      <RecurringScheduleActions scheduleId={schedule.id} status={schedule.status} />

      {generated.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium">Generated invoices</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {generated.map((inv) => (
              <li key={inv.id} className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/admin/tl-invoices/${inv.id}`}
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {inv.number ?? "Draft"} — {formatMoney(Number(inv.total), inv.currency)}
                </Link>
                <span className="text-zinc-500">{formatYmd(inv.issueDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <RecurringScheduleForm customers={customerOptions} initial={initial} readOnly={readOnly} />
    </div>
  );
}
