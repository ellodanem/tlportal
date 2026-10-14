import Link from "next/link";

import { WorkQueueToolbar } from "@/components/admin/work-queue-toolbar";
import { formatExpenseAmount, EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";
import { effectiveVendorBillStatus } from "@/lib/services/vendor-bill-service";
import type { Prisma } from "@prisma/client";

type Props = { searchParams: Promise<{ view?: string; q?: string }> };
type PurchaseRow = { id: string; kind: "bill" | "expense"; date: Date; vendor: string; detail: string; amount: number; currency: string; status: string; href: string };

export default async function PurchasesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const requestedView = sp.view ?? "all";
  const view = ["all", "bills", "expenses"].includes(requestedView) ? requestedView : "all";
  const billWhere: Prisma.VendorBillWhereInput = query ? { OR: [{ vendorInvoiceNumber: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { vendor: { is: { name: { contains: query, mode: "insensitive" } } } }] } : {};
  const expenseWhere: Prisma.ExpenseWhereInput = query ? { OR: [{ vendor: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { reference: { contains: query, mode: "insensitive" } }, { vendorRecord: { is: { name: { contains: query, mode: "insensitive" } } } }] } : {};
  const [bills, expenses] = await Promise.all([
    view === "expenses" ? Promise.resolve([]) : prisma.vendorBill.findMany({ where: billWhere, orderBy: { billDate: "desc" }, take: 100, include: { vendor: { select: { name: true } } } }),
    view === "bills" ? Promise.resolve([]) : prisma.expense.findMany({ where: expenseWhere, orderBy: { expenseDate: "desc" }, take: 100, include: { vendorRecord: { select: { name: true } } } }),
  ]);
  const rows: PurchaseRow[] = [
    ...bills.map((bill) => ({ id: bill.id, kind: "bill" as const, date: bill.billDate, vendor: bill.vendor.name, detail: bill.vendorInvoiceNumber || bill.description || "Vendor bill", amount: Number(bill.amountDue), currency: bill.currency, status: effectiveVendorBillStatus(bill).replace("_", " "), href: `/admin/bills/${bill.id}` })),
    ...expenses.map((expense) => ({ id: expense.id, kind: "expense" as const, date: expense.expenseDate, vendor: expense.vendorRecord?.name ?? expense.vendor, detail: expense.description || EXPENSE_PAYMENT_METHOD_LABELS[expense.method], amount: Number(expense.amount), currency: expense.currency, status: expense.receiptStoragePath ? "Paid · receipt" : "Paid · no receipt", href: `/admin/expenses/${expense.id}` })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  const outstanding = bills.reduce((sum, bill) => sum + Number(bill.amountDue), 0);
  const paidExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Purchases</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">All purchases</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">One queue for money already spent and supplier bills still to be paid.</p></div><div className="flex flex-wrap gap-2"><Link href="/admin/expenses/new" className="rounded-lg border px-4 py-2.5 text-sm font-semibold">Paid expense</Link><Link href="/admin/bills/new" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">Vendor bill</Link></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Bills to pay</p><p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">{formatExpenseAmount(outstanding)}</p></div><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Paid expenses shown</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatExpenseAmount(paidExpenses)}</p></div></div>
    <WorkQueueToolbar basePath="/admin/purchases" query={query} placeholder="Search vendor, invoice, description, or reference" activeView={view} hiddenFields={{ view }} views={[{ id: "all", label: "All purchases" }, { id: "bills", label: "Bills to pay" }, { id: "expenses", label: "Paid expenses" }]} />
    {rows.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">{query ? "No purchases match this search." : "No purchases recorded yet."}</p> : <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Detail</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.map((row) => <tr key={`${row.kind}-${row.id}`}><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.kind === "bill" ? "bg-blue-100 text-blue-800" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>{row.kind === "bill" ? "Bill" : "Expense"}</span></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.date.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="px-4 py-3 font-medium">{row.vendor}</td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.detail}</td><td className="px-4 py-3 text-xs">{row.status}</td><td className="px-4 py-3 text-right tabular-nums">{formatExpenseAmount(row.amount, row.currency)}</td><td className="px-4 py-3 text-right"><Link href={row.href} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>)}</tbody></table></div>}
  </div>;
}
