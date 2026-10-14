import Link from "next/link";

import { VendorBillForm, type BillVendorOption } from "@/components/admin/vendor-bill-form";
import { prisma } from "@/lib/db";

export default async function NewVendorBillPage() {
  const vendors = await prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, paymentTerms: true } });
  return <div className="flex flex-col gap-8"><div><Link href="/admin/bills" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Vendor bills</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">New vendor bill</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Record a supplier invoice and track the balance until it is paid.</p></div><VendorBillForm vendors={vendors as BillVendorOption[]} /></div>;
}
