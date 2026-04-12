import Link from "next/link";
import { notFound } from "next/navigation";

import { SubscriptionOptionForm } from "@/components/admin/subscription-option-form";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function EditSubscriptionOptionPage({ params }: Props) {
  const { id } = await params;
  const row = await prisma.subscriptionOption.findUnique({ where: { id } });
  if (!row) {
    notFound();
  }

  const priceXcd = row.priceXcd.toFixed(2);

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/subscription-options" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Subscription options
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit option</h1>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <SubscriptionOptionForm
          initial={{
            id: row.id,
            durationMonths: row.durationMonths,
            priceXcd,
            isActive: row.isActive,
          }}
        />
      </div>
    </div>
  );
}
