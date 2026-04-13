import Link from "next/link";

import { prisma } from "@/lib/db";

function clientSummary(row: {
  clientLabel: string | null;
  customer: { company: string | null; firstName: string | null; lastName: string | null } | null;
}): string {
  if (row.clientLabel?.trim()) return row.clientLabel.trim();
  const c = row.customer;
  if (!c) return "—";
  if (c.company?.trim()) return c.company.trim();
  const person = [c.firstName?.trim(), c.lastName?.trim()].filter(Boolean).join(" ");
  return person || "—";
}

export default async function ProposalsPage() {
  const proposals = await prisma.proposal.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      clientLabel: true,
      customer: {
        select: { company: true, firstName: true, lastName: true },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Proposals</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Draft client-facing PDFs. Estimates and invoices can plug in later (e.g. Invoiless).
          </p>
        </div>
        <Link
          href="/admin/proposals/new"
          className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          New proposal
        </Link>
      </div>

      {proposals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          No proposals yet. Create one to get the default template (Ellodane Enterprises / Track Lucia), line items, and
          visual placeholders.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {proposals.map((p) => (
                <tr key={p.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{clientSummary(p)}</td>
                  <td className="px-4 py-3 capitalize">{p.status}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {p.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/proposals/${p.id}`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Edit
                    </Link>
                    <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
                    <a
                      href={`/api/admin/proposals/${p.id}/pdf`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
