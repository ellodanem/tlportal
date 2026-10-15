import Link from "next/link";
import { notFound } from "next/navigation";

import { CanonicalSubscriptionCreateForm } from "@/components/admin/canonical-subscription-create-form";
import { prisma } from "@/lib/db";
import { canonicalSubscriptionUiEnabled } from "@/lib/domain/canonical-subscription-admin";

function label(customer: { company: string | null; firstName: string | null; lastName: string | null }) {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Unnamed customer";
}

export default async function NewCanonicalSubscriptionPage() {
  if (!canonicalSubscriptionUiEnabled()) notFound();
  const customers = await prisma.customer.findMany({
    where: { archivedAt: null },
    orderBy: [{ company: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, company: true, firstName: true, lastName: true },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Canonical subscriptions</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Create canonical draft</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Capture the commercial agreement and optional first service without affecting live billing.</p>
      </div>
      {customers.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">Add an active customer before creating a subscription draft.</p> : null}
      <CanonicalSubscriptionCreateForm
        customers={customers.map((customer) => ({ id: customer.id, label: label(customer) }))}
        today={today}
      />
    </div>
  );
}
