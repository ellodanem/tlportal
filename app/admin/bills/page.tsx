import Link from "next/link";

import { VendorBillPaymentForm } from "@/components/admin/vendor-bill-payment-form";
import { WorkQueueToolbar } from "@/components/admin/work-queue-toolbar";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";
import { effectiveVendorBillStatus } from "@/lib/services/vendor-bill-service";
import type { Prisma } from "@prisma/client";

type Props = { searchParams: Promise<{ view?: string; q?: string; vendorId?: string; from?: string; to?: string }> };

export default async function VendorBillsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const vendorId = (sp.vendorId ?? "").trim();
  const from = (sp.from ?? "").trim();
  const to = (sp.to ?? "").trim();
  const views = ["all", "unpaid", "overdue", "draft", "paid", "void"] as const;
  type BillView = (typeof views)[number];
  const requested = sp.view ?? "";
  const selectedView: BillView = views.includes(requested as BillView) ? requested as BillView : "all";
  const now = new Date();
  const filters: Prisma.VendorBillWhereInput[] = [];
  if (selectedView === "draft") filters.push({ status: "draft" });
  if (selectedView === "paid") filters.push({ status: "paid" });
  if (selectedView === "void") filters.push({ status: "void" });
  if (selectedView === "unpaid") filters.push({ status: { in: ["open", "partially_paid", "overdue"] } });
  if (selectedView === "overdue") filters.push({ OR: [{ status: "overdue" }, { status: { in: ["open", "partially_paid"] }, dueDate: { lt: now } }] });
  if (vendorId) filters.push({ vendorId });
  if (from || to) filters.push({ billDate: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } });
  if (query) filters.push({ OR: [{ vendorInvoiceNumber: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { vendor: { is: { name: { contains: query, mode: "insensitive" } } } }] });
  const where: Prisma.VendorBillWhereInput = filters.length ? { AND: filters } : {};
  const [bills, vendors] = await Promise.all([
    prisma.vendorBill.findMany({ where, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], include: { vendor: { select: { name: true } } } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const unpaidTotal = bills.filter((bill) => ["open", "partially_paid", "overdue"].includes(effectiveVendorBillStatus(bill))).reduce((sum, bill) => sum + Number(bill.amountDue), 0);
  const hasFilters = Boolean(query || vendorId || from || to);

  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Purchases / Bills</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Bills</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Track supplier invoices, balances due, and payments from one work queue.</p></div><Link href="/admin/bills/new" className="inline-flex justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">Create a bill</Link></div>
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Current view amount due</p><p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">{formatExpenseAmount(unpaidTotal)}</p></div>
    <WorkQueueToolbar basePath="/admin/bills" query={query} placeholder="Search vendor, supplier invoice, or description" activeView={selectedView} hiddenFields={{ view: selectedView, vendorId, from, to }} views={[{ id: "all", label: "All bills" }, { id: "unpaid", label: "Unpaid" }, { id: "overdue", label: "Overdue" }, { id: "draft", label: "Draft" }, { id: "paid", label: "Paid" }, { id: "void", label: "Void" }]} />
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><input type="hidden" name="view" value={selectedView} /><label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Vendor<select name="vendorId" defaultValue={vendorId} className="mt-1 block rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"><option value="">All vendors</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">From<input type="date" name="from" defaultValue={from} className="mt-1 block rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label><label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">To<input type="date" name="to" defaultValue={to} className="mt-1 block rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label><button type="submit" className="rounded-lg border px-4 py-2 text-sm font-semibold">Filter</button>{vendorId || from || to ? <Link href={`/admin/bills?view=${selectedView}`} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Clear</Link> : null}</form>
    {bills.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">{hasFilters ? "No bills match these filters." : "No vendor bills in this view."}</p> : <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Due</th><th className="px-4 py-3 text-right">Amount due</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{bills.map((bill) => { const status = effectiveVendorBillStatus(bill); return <tr key={bill.id}><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status === "paid" ? "bg-emerald-100 text-emerald-900" : status === "overdue" ? "bg-rose-100 text-rose-900" : status === "draft" ? "bg-zinc-200 text-zinc-700" : "bg-amber-100 text-amber-900"}`}>{status.replace("_", " ")}</span></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bill.billDate.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="px-4 py-3 font-medium"><Link href={`/admin/bills/${bill.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">{bill.vendor.name}</Link><p className="text-xs text-zinc-500">{bill.vendorInvoiceNumber || bill.description || "Vendor bill"}</p></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bill.dueDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "-"}</td><td className="px-4 py-3 text-right tabular-nums">{formatExpenseAmount(Number(bill.amountDue), bill.currency)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-2"><Link href={`/admin/bills/${bill.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open</Link>{status !== "draft" && status !== "paid" && status !== "void" && Number(bill.amountDue) > 0 ? <VendorBillPaymentForm billId={bill.id} amountDue={Number(bill.amountDue)} currency={bill.currency} /> : null}</div></td></tr>; })}</tbody></table></div>}
  </div>;
}
