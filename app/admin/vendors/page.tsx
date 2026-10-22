import Link from "next/link";

import { WorkQueueToolbar } from "@/components/admin/work-queue-toolbar";
import { prisma } from "@/lib/db";

type Props = { searchParams: Promise<{ view?: string; q?: string }> };

export default async function VendorsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const vendorViews = ["active", "archived"] as const;
  type VendorView = (typeof vendorViews)[number];
  const selectedView: VendorView = vendorViews.includes((sp.view ?? "") as VendorView) ? (sp.view as VendorView) : "active";
  const vendors = await prisma.vendor.findMany({
    where: {
      isActive: selectedView === "active",
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }, { phone: { contains: query, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { bills: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Purchases / Vendors</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Vendors</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Suppliers and service providers used by the purchases workspace. Bills and payables can build on these records later.</p>
        </div>
        <Link href="/admin/vendors/new" className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 dark:bg-emerald-500">New vendor</Link>
      </div>

      <WorkQueueToolbar
        basePath="/admin/vendors"
        query={query}
        placeholder="Search vendor, email, or phone"
        activeView={selectedView}
        hiddenFields={{ view: selectedView }}
        views={[{ id: "active", label: "Active" }, { id: "archived", label: "Archived" }]}
      />

      {vendors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">{query ? "No vendors match this search." : selectedView === "active" ? "No vendors yet. Add the suppliers you pay regularly." : "No archived vendors."}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3">Expenses</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-4 py-3"><Link href={`/admin/vendors/${vendor.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{vendor.name}</Link><p className="text-xs text-zinc-500">{vendor.currency}</p></td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{vendor.email ?? vendor.phone ?? "—"}</td>
                  <td className="px-4 py-3">Net {vendor.paymentTerms}</td>
                  <td className="px-4 py-3 tabular-nums">{vendor._count.bills}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/admin/vendors/${vendor.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
