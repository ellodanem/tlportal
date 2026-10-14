import Link from "next/link";

import { customerInitials } from "@/lib/admin/customer-list";
import { customerDisplayName } from "@/lib/admin/customer-display";

type CustomerHeaderCustomer = {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  archivedAt?: Date | null;
};

export function CustomerWorkspaceHeader({ customer }: { customer: CustomerHeaderCustomer }) {
  const name = customerDisplayName(customer);
  const createQuery = `?customerId=${encodeURIComponent(customer.id)}`;

  return (
    <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
            {customerInitials(customer)}
          </span>
          <div className="min-w-0">
            <Link href="/admin/customers" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
              ← Customers
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{name}</h1>
              {customer.archivedAt ? (
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Archived
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {customer.email ? <a href={`mailto:${customer.email}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">{customer.email}</a> : <span>No email</span>}
              {customer.phone ? <a href={`tel:${customer.phone}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">{customer.phone}</a> : null}
            </div>
            {customer.tags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customer.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{tag}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <details className="relative">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500">
              New
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <Link href={`/admin/quotes/new${createQuery}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">Quote</Link>
              <Link href={`/admin/tl-invoices/new${createQuery}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">Invoice</Link>
              <Link href={`/admin/recurring-invoices/new${createQuery}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">Recurring schedule</Link>
              <Link href={`/admin/customers/${customer.id}/messages`} className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">Message customer</Link>
            </div>
          </details>
          <Link href={`/admin/customers/${customer.id}/billing`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800">
            Billing
          </Link>
          <Link href={`/admin/customers/${customer.id}/edit`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800">
            Edit
          </Link>
        </div>
      </div>
    </header>
  );
}
