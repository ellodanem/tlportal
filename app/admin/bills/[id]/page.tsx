import Link from "next/link";
import { notFound } from "next/navigation";

import { VendorBillPaymentForm, VendorBillVoidForm } from "@/components/admin/vendor-bill-payment-form";
import { VendorBillForm, type BillVendorOption, type VendorBillFormInitial } from "@/components/admin/vendor-bill-form";
import { formatExpenseAmount, EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/domain/expenses";
import { effectiveVendorBillStatus } from "@/lib/services/vendor-bill-service";
import { prisma } from "@/lib/db";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";

function ymd(date: Date | null) { return date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}` : ""; }

export default async function VendorBillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [bill, vendors, categories, customers, devices] = await Promise.all([
    prisma.vendorBill.findUnique({ where: { id }, include: { vendor: true, category: { select: { name: true } }, customer: { select: { company: true, firstName: true, lastName: true } }, device: { select: { label: true, imei: true } }, payments: { where: { voidedAt: null }, orderBy: { paidAt: "desc" } } } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, paymentTerms: true } }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: activeCustomerWhere, orderBy: [{ company: "asc" }, { lastName: "asc" }], select: { id: true, company: true, firstName: true, lastName: true } }),
    prisma.device.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, label: true, imei: true } }),
  ]);
  if (!bill) notFound();
  const status = effectiveVendorBillStatus(bill);
  const editable = bill.status === "draft";
  const initial: VendorBillFormInitial = { id: bill.id, vendorId: bill.vendorId, vendorInvoiceNumber: bill.vendorInvoiceNumber ?? "", description: bill.description ?? "", currency: bill.currency, total: String(bill.total), billDate: ymd(bill.billDate), dueDate: ymd(bill.dueDate), notes: bill.notes ?? "", status: "draft", categoryId: bill.categoryId ?? "", customerId: bill.customerId ?? "", deviceId: bill.deviceId ?? "", hasReceipt: Boolean(bill.receiptStoragePath) };
  return <div className="flex flex-col gap-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/admin/bills" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Expenses</Link><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{bill.vendor.name}</h1><span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">{status.replace("_", " ")}</span></div><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{bill.vendorInvoiceNumber ?? "No supplier reference"} · {formatExpenseAmount(Number(bill.amountDue), bill.currency)} due</p></div>{bill.receiptStoragePath ? <a href={`/api/admin/expenses/${bill.id}/receipt`} className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold">View receipt</a> : null}</div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs uppercase tracking-wide text-zinc-500">Total</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatExpenseAmount(Number(bill.total), bill.currency)}</p></div><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs uppercase tracking-wide text-zinc-500">Paid</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatExpenseAmount(Number(bill.amountPaid), bill.currency)}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30"><p className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-300">Balance due</p><p className="mt-2 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">{formatExpenseAmount(Number(bill.amountDue), bill.currency)}</p></div></div>
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-sm font-semibold">Expense details</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-zinc-500">Category</dt><dd className="font-medium">{bill.category?.name ?? "Uncategorized"}</dd></div><div><dt className="text-zinc-500">Customer</dt><dd className="font-medium">{bill.customer ? customerDisplayName(bill.customer) : "—"}</dd></div><div><dt className="text-zinc-500">Device</dt><dd className="font-medium">{bill.device?.label?.trim() || bill.device?.imei || "—"}</dd></div></dl></section>
    {editable ? <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-4 text-sm font-semibold">Edit draft</h2><VendorBillForm vendors={vendors as BillVendorOption[]} categories={categories} customers={customers.map((item) => ({ id: item.id, label: customerDisplayName(item) }))} devices={devices.map((item) => ({ id: item.id, label: item.label?.trim() || item.imei }))} initial={initial} /></section> : null}
    {!editable && bill.status !== "void" && Number(bill.amountDue) > 0 ? <VendorBillPaymentForm billId={bill.id} amountDue={Number(bill.amountDue)} currency={bill.currency} /> : null}
    {bill.payments.length > 0 ? <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-sm font-semibold">Payments made</h2><div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">{bill.payments.map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-2 py-3 first:pt-0"><span>{formatExpenseAmount(Number(payment.amount), payment.currency)} · {EXPENSE_PAYMENT_METHOD_LABELS[payment.method]}{payment.reference ? ` · ${payment.reference}` : ""}</span><time className="text-sm text-zinc-500">{payment.paidAt.toLocaleDateString(undefined, { dateStyle: "medium" })}</time></div>)}</div></section> : null}
    {bill.status !== "void" && bill.status !== "paid" ? <VendorBillVoidForm billId={bill.id} /> : null}
  </div>;
}
