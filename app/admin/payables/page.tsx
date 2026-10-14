import Link from "next/link";

import { formatExpenseAmount } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";

type Bucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

function bucketFor(dueDate: Date | null, now: Date): Bucket {
  if (!dueDate || dueDate >= now) return "current";
  const days = Math.ceil((now.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const bucketLabels: Record<Bucket, string> = { current: "Current", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "90+ days" };

export default async function PayablesPage() {
  const now = new Date();
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: ["open", "partially_paid", "overdue"] }, amountDue: { gt: 0 } },
    orderBy: [{ dueDate: "asc" }, { amountDue: "desc" }],
    include: { vendor: { select: { name: true } } },
  });
  const buckets = new Map<Bucket, number>([["current", 0], ["1-30", 0], ["31-60", 0], ["61-90", 0], ["90+", 0]]);
  const vendors = new Map<string, { name: string; total: number; count: number }>();
  for (const bill of bills) {
    const amount = Number(bill.amountDue);
    const bucket = bucketFor(bill.dueDate, now);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + amount);
    const existing = vendors.get(bill.vendorId) ?? { name: bill.vendor.name, total: 0, count: 0 };
    existing.total += amount;
    existing.count += 1;
    vendors.set(bill.vendorId, existing);
  }
  const total = bills.reduce((sum, bill) => sum + Number(bill.amountDue), 0);
  const topVendors = [...vendors.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  const overdueBills = bills.filter((bill) => bucketFor(bill.dueDate, now) !== "current").slice(0, 8);

  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Purchases / Payables</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Accounts payable</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">See what is owed to vendors, where balances are concentrated, and which bills need attention.</p></div><Link href="/admin/bills/new" className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 dark:bg-emerald-500">New bill</Link></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30 lg:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Total outstanding</p><p className="mt-2 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">{formatExpenseAmount(total)}</p><p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">{bills.length} open bill{bills.length === 1 ? "" : "s"}</p></div>{([...buckets] as [Bucket, number][]).map(([bucket, amount]) => <div key={bucket} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{bucketLabels[bucket]}</p><p className="mt-2 text-lg font-semibold tabular-nums">{formatExpenseAmount(amount)}</p></div>)}</section>
    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Vendor balances</h2><p className="mt-1 text-xs text-zinc-500">Largest outstanding balances first.</p></div><Link href="/admin/bills?view=unpaid" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">View bills</Link></div><div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">{topVendors.length === 0 ? <p className="py-6 text-sm text-zinc-500">No outstanding vendor bills.</p> : topVendors.map(([vendorId, vendor]) => <div key={vendorId} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div><p className="font-medium">{vendor.name}</p><p className="text-xs text-zinc-500">{vendor.count} bill{vendor.count === 1 ? "" : "s"}</p></div><p className="font-semibold tabular-nums">{formatExpenseAmount(vendor.total)}</p></div>)}</div></section>
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Overdue attention</h2><p className="mt-1 text-xs text-zinc-500">Bills ordered by due date.</p></div><Link href="/admin/bills?view=overdue" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">View overdue</Link></div><div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">{overdueBills.length === 0 ? <p className="py-6 text-sm text-zinc-500">Nothing overdue.</p> : overdueBills.map((bill) => <Link key={bill.id} href={`/admin/bills/${bill.id}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"><div><p className="font-medium">{bill.vendor.name}</p><p className="text-xs text-rose-700 dark:text-rose-300">{bill.dueDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "No due date"}</p></div><p className="font-semibold tabular-nums">{formatExpenseAmount(Number(bill.amountDue), bill.currency)}</p></Link>)}</div></section>
    </div>
  </div>;
}
