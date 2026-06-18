import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { CustomerServicesExpand } from "@/components/admin/customer-services-expand";
import type { CustomerTableDeviceRow } from "@/lib/admin/customer-table-rows";
import type { CustomerBillingMode } from "@prisma/client";

import type { AssignmentRollup } from "@/lib/admin/customer-list";

export type CustomerTableRow = {
  id: string;
  displayName: string;
  initials: string;
  subtitle: string;
  tagsLine: string | null;
  activeServices: number;
  distinctDevices: number;
  devices: CustomerTableDeviceRow[];
  nextDue: Date | null;
  billingMode: CustomerBillingMode;
  invoilessLinked: boolean;
  stripeStatus: string | null;
  rollup: AssignmentRollup;
  updatedAt: Date;
  archivedAt: Date | null;
};

function RollupPill({ rollup }: { rollup: AssignmentRollup }) {
  const map: Record<AssignmentRollup, { label: string; className: string }> = {
    overdue: {
      label: "Overdue",
      className:
        "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
    },
    due_soon: {
      label: "Due soon",
      className:
        "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    },
    suspended: {
      label: "Suspended",
      className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
    },
    active: {
      label: "Active",
      className:
        "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
    },
    none: {
      label: "No services",
      className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    },
  };
  const x = map[rollup];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${x.className}`}>
      {x.label}
    </span>
  );
}

function BillingModeBadge({
  billingMode,
  stripeStatus,
}: {
  billingMode: CustomerBillingMode;
  stripeStatus: string | null;
}) {
  if (billingMode === "stripe_subscription") {
    const troubled = stripeStatus === "past_due" || stripeStatus === "unpaid";
    return (
      <span
        className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          troubled
            ? "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
            : "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
        }`}
        title={stripeStatus ? `Stripe · ${stripeStatus}` : "Stripe billing"}
      >
        Stripe{stripeStatus ? ` · ${stripeStatus}` : ""}
      </span>
    );
  }
  return null;
}

/** Inline next to customer name when Invoiless is configured. */
function InvoilessLinkIcon({ linked }: { linked: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 align-middle text-zinc-500 dark:text-zinc-400"
      title={linked ? "Linked" : "Unlinked"}
    >
      {linked ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/50">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="text-emerald-600 dark:text-emerald-400">
            <path
              d="M2.5 6.5L5 9l4.5-5.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-amber-600/90 dark:text-amber-500/90">
            <path
              d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </span>
  );
}

function formatDue(d: Date) {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CustomersTable({
  rows,
  invoilessConfigured,
  showArchived = false,
}: {
  rows: CustomerTableRow[];
  invoilessConfigured: boolean;
  showArchived?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        <thead className="bg-zinc-50/90 dark:bg-zinc-950/80">
          <tr>
            <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Customer
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 md:table-cell dark:text-zinc-400">
              Services
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 lg:table-cell dark:text-zinc-400">
              Next due
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 md:table-cell dark:text-zinc-400">
              Status
            </th>
            <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Updated
            </th>
            <th className="w-10 px-2 py-3.5" aria-hidden />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-14 text-center text-zinc-500" colSpan={6}>
                {showArchived ? (
                  "No archived customers."
                ) : (
                  <>
                    No customers yet.{" "}
                    <Link href="/admin/customers/new" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                      Create one
                    </Link>
                    .
                  </>
                )}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className={`group transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 ${r.archivedAt ? "opacity-80" : ""}`}
              >
                <td className="px-4 py-4 align-top">
                  <Link href={`/admin/customers/${r.id}`} className="flex gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                      aria-hidden
                    >
                      {r.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate font-semibold text-zinc-900 group-hover:text-emerald-800 dark:text-zinc-50 dark:group-hover:text-emerald-300">
                          {r.displayName}
                        </span>
                        <BillingModeBadge billingMode={r.billingMode} stripeStatus={r.stripeStatus} />
                        {r.archivedAt ? (
                          <span className="inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            Archived
                          </span>
                        ) : null}
                        {invoilessConfigured && r.billingMode !== "stripe_subscription" ? (
                          <InvoilessLinkIcon linked={r.invoilessLinked} />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{r.subtitle}</span>
                      {r.tagsLine ? (
                        <span className="mt-1 block truncate text-[11px] text-zinc-400 dark:text-zinc-500">{r.tagsLine}</span>
                      ) : null}
                      <span className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
                        <RollupPill rollup={r.rollup} />
                        <CustomerServicesExpand customerId={r.id} billingMode={r.billingMode} devices={r.devices} />
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="hidden align-top px-4 py-4 md:table-cell">
                  <span className="block font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{r.activeServices}</span>
                  <div className="mt-1">
                    <CustomerServicesExpand customerId={r.id} billingMode={r.billingMode} devices={r.devices} />
                  </div>
                </td>
                <td className="hidden align-top px-4 py-4 lg:table-cell">
                  {r.nextDue ? (
                    <>
                      <span className="block font-semibold text-zinc-900 dark:text-zinc-50">{formatDue(r.nextDue)}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">Earliest renewal</span>
                    </>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="hidden align-top px-4 py-4 md:table-cell">
                  <RollupPill rollup={r.rollup} />
                </td>
                <td className="align-top px-4 py-4">
                  <span className="block font-medium text-zinc-800 dark:text-zinc-200">
                    {formatDistanceToNow(r.updatedAt, { addSuffix: true })}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{formatDue(r.updatedAt)}</span>
                </td>
                <td className="align-middle px-2 py-4 text-zinc-300 dark:text-zinc-600">
                  <Link
                    href={`/admin/customers/${r.id}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    aria-label={`Open ${r.displayName}`}
                  >
                    <span className="text-lg font-light" aria-hidden>
                      ›
                    </span>
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function customersTableTitle(count: number) {
  return count === 0 ? "Customers" : `Customers (${count})`;
}
