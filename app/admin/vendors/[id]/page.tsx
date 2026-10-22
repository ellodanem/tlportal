import Link from "next/link";
import { notFound } from "next/navigation";

import { VendorForm, type VendorFormInitial } from "@/components/admin/vendor-form";
import { toggleVendorStatusAction } from "@/app/admin/vendors/actions";
import { formatExpenseAmount, EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      bills: { where: { status: { not: "void" } }, orderBy: { billDate: "desc" }, take: 20, include: { category: { select: { name: true } }, payments: { where: { voidedAt: null }, orderBy: { paidAt: "desc" }, take: 1 } } },
    },
  });
  if (!vendor) notFound();

  const spendSummary = await prisma.vendorBill.aggregate({ where: { vendorId: vendor.id, status: { not: "void" } }, _sum: { total: true }, _count: { _all: true } });
  const totalSpend = Number(spendSummary._sum.total ?? 0);
  const initial: VendorFormInitial = { id: vendor.id, name: vendor.name, email: vendor.email ?? "", phone: vendor.phone ?? "", currency: vendor.currency, paymentTerms: vendor.paymentTerms, notes: vendor.notes ?? "" };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/vendors" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Vendors</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{vendor.name}</h1><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${vendor.isActive ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>{vendor.isActive ? "Active" : "Archived"}</span></div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{vendor.email ?? "No email"}{vendor.phone ? ` · ${vendor.phone}` : ""}</p>
        </div>
        <form action={toggleVendorStatusAction}><input type="hidden" name="vendorId" value={vendor.id} /><button type="submit" className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">{vendor.isActive ? "Archive vendor" : "Restore vendor"}</button></form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recorded spend</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatExpenseAmount(totalSpend, vendor.currency)}</p></div><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Expenses</p><p className="mt-2 text-2xl font-semibold tabular-nums">{spendSummary._count._all}</p></div><div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payment terms</p><p className="mt-2 text-2xl font-semibold">Net {vendor.paymentTerms}</p></div></div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-4 text-sm font-semibold">Vendor details</h2><VendorForm initial={initial} /></section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-sm font-semibold">Recent expenses</h2>{vendor.bills.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No expenses linked yet.</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="px-2 py-2">Date</th><th className="px-2 py-2">Description</th><th className="px-2 py-2">Category</th><th className="px-2 py-2">Status / method</th><th className="px-2 py-2 text-right">Amount</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{vendor.bills.map((expense) => <tr key={expense.id}><td className="px-2 py-2">{expense.billDate.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="px-2 py-2"><Link href={`/admin/bills/${expense.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">{expense.description || "Expense"}</Link></td><td className="px-2 py-2 text-zinc-500">{expense.category?.name ?? "—"}</td><td className="px-2 py-2">{expense.payments[0] ? EXPENSE_PAYMENT_METHOD_LABELS[expense.payments[0].method] : expense.status.replace("_", " ")}</td><td className="px-2 py-2 text-right tabular-nums">{formatExpenseAmount(Number(expense.total), expense.currency)}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
