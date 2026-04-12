import type { Metadata } from "next";
import Link from "next/link";

import { RegistrationForm } from "@/components/register/registration-form";
import { prisma } from "@/lib/db";
import { formatSubscriptionChoiceLabel } from "@/lib/subscription-options/display";
import { ensureSubscriptionPlanRows } from "@/lib/subscription-options/ensure-plans";

export const metadata: Metadata = {
  title: "Register — Track Lucia",
  description: "Submit your Track Lucia service registration.",
};

/** DB-backed options; avoid static prerender at build (schema must match Prisma client). */
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  await ensureSubscriptionPlanRows();
  const rows = await prisma.subscriptionOption.findMany({
    where: { isActive: true },
    orderBy: { durationMonths: "asc" },
    select: { id: true, durationMonths: true, priceXcd: true },
  });
  const subscriptionOptions = rows.map((o) => ({
    id: o.id,
    displayLabel: formatSubscriptionChoiceLabel(o.durationMonths, o.priceXcd),
  }));

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="mx-auto max-w-lg">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <h1 className="mt-1 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Service registration</h1>
        <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Complete this form so our team can set up your account. This page is separate from admin sign-in.
        </p>

        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <RegistrationForm subscriptionOptions={subscriptionOptions} />
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400">
            Back to home
          </Link>
          {" · "}
          <Link href="/login" className="text-zinc-600 underline hover:text-zinc-800 dark:text-zinc-400">
            Admin login
          </Link>
        </p>
      </div>
    </div>
  );
}
