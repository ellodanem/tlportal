import Link from "next/link";

import { prisma } from "@/lib/db";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      invoilessCustomerId: true,
      updatedAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Customers</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Local records; use Sync on a customer when Invoiless is configured.
          </p>
        </div>
        <Link
          href="/admin/customers/new"
          className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          Add customer
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Invoiless</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {customers.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-zinc-500" colSpan={5}>
                  No customers yet.{" "}
                  <Link href="/admin/customers/new" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Create one
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const name =
                  c.company?.trim() ||
                  [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
                  "—";
                return (
                  <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {c.invoilessCustomerId ? (
                        <span title={c.invoilessCustomerId}>linked</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {c.updatedAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
