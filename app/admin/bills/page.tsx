import Link from "next/link";

import { WorkQueueToolbar } from "@/components/admin/work-queue-toolbar";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { effectiveVendorBillStatus } from "@/lib/services/vendor-bill-service";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type Props = { searchParams: Promise<{ view?: string; q?: string }> };

export default async function VendorBillsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
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
  if (query) filters.push({ OR: [{ vendorInvoiceNumber: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { vendor: { is: { name: { contains: query, mode: "insensitive" } } } }] });
  const where: Prisma.VendorBillWhereInput = {
    ...(filters.length ? { AND: filters } : {}),
  };
  const bills = await prisma.vendorBill.findMany({ where, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], include: { vendor: { select: { name: true } } } });
  const unpaidTotal = bills.filter((bill) => ["open", "partially_paid", "overdue"].includes(effectiveVendorBillStatus(bill))).reduce((sum, bill) => sum + Number(bill.amountDue), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Purchases / Bills</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Vendor bills</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Track supplier invoices from open through paid, including partial payments and overdue balances.</p></div><Link href="/admin/bills/new" className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 dark:bg-emerald-500">New bill</Link></div>
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Current view outstanding</p><p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">{formatExpenseAmount(unpaidTotal)}</p></div>
      <WorkQueueToolbar basePath="/admin/bills" query={query} placeholder="Search vendor, supplier invoice, or description" activeView={selectedView} hiddenFields={{ view: selectedView }} views={[{ id: "all", label: "All bills" }, { id: "unpaid", label: "Unpaid" }, { id: "overdue", label: "Overdue" }, { id: "draft", label: "Draft" }, { id: "paid", label: "Paid" }, { id: "void", label: "Void" }]} />
      {bills.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">{query ? "No bills match this search." : "No vendor bills in this view."}</p> : <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Supplier invoice</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Due</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{bills.map((bill) => { const status = effectiveVendorBillStatus(bill); return <tr key={bill.id}><td className="px-4 py-3 font-medium"><Link href={`/admin/bills/${bill.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">{bill.vendor.name}</Link><p className="text-xs text-zinc-500">{bill.description || "Vendor bill"}</p></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bill.vendorInvoiceNumber ?? "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status === "paid" ? "bg-emerald-100 text-emerald-900" : status === "overdue" ? "bg-rose-100 text-rose-900" : status === "draft" ? "bg-zinc-200 text-zinc-700" : "bg-amber-100 text-amber-900"}`}>{status.replace("_", " ")}</span></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bill.dueDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "—"}</td><td className="px-4 py-3 text-right tabular-nums">{formatExpenseAmount(Number(bill.amountDue), bill.currency)}</td><td className="px-4 py-3 text-right"><Link href={`/admin/bills/${bill.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>; })}</tbody></table></div>}
    </div>
  );
}
