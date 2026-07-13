import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerEditForm } from "@/components/customer-form";
import { CustomerPortalUsersPanel } from "@/components/admin/customer-portal-users-panel";
import { ArchiveCustomerButton, UnarchiveCustomerButton } from "@/components/archive-customer-button";
import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ archiveError?: string }>;
};

export default async function EditCustomerPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { archiveError } = await searchParams;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      portalUsers: {
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      },
      serviceAssignments: {
        where: { endDate: null, status: { not: "cancelled" } },
        select: { id: true },
      },
    },
  });
  if (!customer) {
    notFound();
  }

  const title = customerDisplayName(customer);
  const isArchived = Boolean(customer.archivedAt);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/customers/${customer.id}`}
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← {title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit customer</h1>
        <p className="mt-1 font-mono text-xs text-zinc-500">{customer.id}</p>
        {isArchived ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            This customer is archived and hidden from active lists and billing reminders.
          </p>
        ) : null}
        {archiveError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {decodeURIComponent(archiveError)}
          </p>
        ) : null}
      </div>

      <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
        Billing, Stripe subscriptions, and payment links are on the{" "}
        <Link
          href={`/admin/customers/${customer.id}/billing`}
          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Billing tab
        </Link>
        .
      </p>

      <CustomerEditForm customer={customer} />

      <section className="max-w-xl rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <CustomerPortalUsersPanel
          customerId={customer.id}
          showTopBorder={false}
          users={customer.portalUsers.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            traqcareUsername: u.traqcareUsername,
            hasPassword: Boolean(u.traqcarePassword),
            traqcarePassword: u.traqcarePassword,
            role: u.role,
            notes: u.notes,
          }))}
        />
      </section>

      <div className="flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Archive</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Archive churned customers who will not renew. They stay in the system for history but stop receiving reminders
            and disappear from the active customer list.
          </p>
        </div>
        {isArchived ? (
          <UnarchiveCustomerButton customerId={customer.id} displayName={title} />
        ) : (
          <ArchiveCustomerButton
            customerId={customer.id}
            displayName={title}
            openAssignmentCount={customer.serviceAssignments.length}
          />
        )}
      </div>

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DeleteCustomerButton customerId={customer.id} />
      </div>
    </div>
  );
}
