import Link from "next/link";
import { notFound } from "next/navigation";

import { UsagePurposeBadge } from "@/components/admin/device/usage-purpose-badge";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

function displayName(c: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  const co = c.company?.trim();
  if (co) return co;
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return person || "Customer";
}

function formatDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusPill(status: string) {
  const base =
    "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize";
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    due_soon: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    overdue: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200",
    suspended: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
    cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span className={`${base} ${map[status] ?? map.suspended}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      serviceAssignments: {
        orderBy: { startDate: "desc" },
        include: {
          device: {
            include: {
              deviceModel: true,
              simCard: true,
            },
          },
          simCard: true,
        },
      },
    },
  });

  if (!customer) {
    notFound();
  }

  const name = displayName(customer);
  const openAssignments = customer.serviceAssignments.filter(
    (a) => a.endDate == null && a.status !== "cancelled",
  );
  const activeServices = openAssignments.length;
  const nextDueDates = openAssignments
    .map((a) => a.nextDueDate)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const nextDue = nextDueDates[0];
  const linkedInvoiless = Boolean(customer.invoilessCustomerId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/admin/customers"
            className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ← Customers
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">
                {customer.email}
              </a>
            ) : (
              <span className="text-zinc-400">No email</span>
            )}
            {customer.phone ? <span>{customer.phone}</span> : null}
          </div>
          <p className="mt-2 font-mono text-xs text-zinc-500">{customer.id}</p>
        </div>
        <Link
          href={`/admin/customers/${customer.id}/edit`}
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          Edit customer
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Active services
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {activeServices}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Open assignments (not cancelled, no end date)
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Invoiless
          </p>
          <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {linkedInvoiless ? "Linked" : "Not linked"}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {linkedInvoiless ? customer.invoilessCustomerId : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Next due
          </p>
          <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {formatDate(nextDue)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Earliest next billing date</p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Service history</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Devices and SIMs tied to this customer through service assignments.
        </p>

        {customer.serviceAssignments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
            No service assignments yet. When devices are assigned with billing, they will appear here.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
              <thead className="bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">SIM</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Next due</th>
                  <th className="px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {customer.serviceAssignments.map((a) => {
                  const iccid = a.device.simCard?.iccid ?? a.simCard?.iccid ?? "—";
                  const modelName = a.device.deviceModel.name;
                  return (
                    <tr key={a.id} className="bg-white dark:bg-zinc-900">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">{a.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-50">{modelName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <UsagePurposeBadge purpose={a.device.usagePurpose} />
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-zinc-500">{a.device.imei}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">{iccid}</td>
                      <td className="px-4 py-3">{statusPill(a.status)}</td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{formatDate(a.nextDueDate)}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(a.startDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
