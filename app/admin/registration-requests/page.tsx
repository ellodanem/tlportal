import Link from "next/link";

import { CopyRegisterLinkButton } from "@/components/admin/copy-register-link-button";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { prisma } from "@/lib/db";

function formatWhen(d: Date) {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RegistrationRequestsPage() {
  const rows = await prisma.registrationRequest.findMany({
    orderBy: { submittedAt: "desc" },
    include: {
      matchesCustomer: { select: { id: true, company: true, firstName: true, lastName: true, email: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Registration requests</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Public submissions from{" "}
          <Link className="text-emerald-700 underline dark:text-emerald-400" href="/register">
            /register
          </Link>
          . <CopyRegisterLinkButton />{" "}
          <span className="max-md:block max-md:mt-1 md:contents">
            Approve to create a customer (notes include the full snapshot). Reject keeps an audit trail.
          </span>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3 text-right"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No registration requests yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const dup = Boolean(r.matchesCustomerId) || r.otherPendingSameEmail > 0;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {formatWhen(r.submittedAt)}
                    </td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{r.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {dup ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-200">
                          Duplicate check
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                      {r.matchesCustomer ? (
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Matches{" "}
                          <Link href={`/admin/customers/${r.matchesCustomer.id}`} className="text-emerald-700 underline dark:text-emerald-400">
                            {customerDisplayName(r.matchesCustomer)}
                          </Link>
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/registration-requests/${r.id}`}
                        className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        Open
                      </Link>
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
