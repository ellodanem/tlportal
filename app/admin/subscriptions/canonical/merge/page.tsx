import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CanonicalSubscriptionMergeForm, type MergeFormCandidate } from "@/components/admin/canonical-subscription-merge-form";
import { prisma } from "@/lib/db";
import { canonicalSubscriptionDisplayName, canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { listMergeCandidates } from "@/lib/services/canonical-subscription-merge-service";
import { canonicalSubscriptionUiStaffViewer, getCanonicalSubscriptionAdminDetail } from "@/lib/services/canonical-subscription-admin-service";

export const dynamic = "force-dynamic";

function customerLabel(customer: { company: string | null; firstName: string | null; lastName: string | null }) {
  return customer.company?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Customer";
}

export default async function MergeSubscriptionsPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { customerId } = await searchParams;
  if (!customerId) notFound();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, company: true, firstName: true, lastName: true },
  });
  if (!customer) notFound();

  const found = await listMergeCandidates(customer.id);
  const details = await Promise.all(found.map((candidate) => getCanonicalSubscriptionAdminDetail(candidate.id)));
  const candidates: MergeFormCandidate[] = found.map((candidate, index) => ({
    id: candidate.id,
    name: canonicalSubscriptionDisplayName(candidate.name, candidate.billingIntervalMonths),
    lifecycleStatus: candidate.lifecycleStatus ?? "unclassified",
    billingIntervalMonths: candidate.billingIntervalMonths,
    currency: candidate.currency ?? "XCD",
    nextBillingDate: candidate.nextBillingDate?.toISOString().slice(0, 10) ?? null,
    key: candidate.key,
    blockers: candidate.blockers,
    liveServiceCount: candidate.liveServiceCount,
    cycleTotalCents: Math.round(Number(details[index]?.summary?.recurringCycleTotal ?? 0) * 100),
  }));
  const label = customerLabel(customer);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/admin/customers/${customer.id}/subscriptions`} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← {label}</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Merge subscriptions</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Combine subscriptions that share the same cycle and renewal date so {label} gets one invoice instead of one per vehicle. Only subscriptions that have never been invoiced can be merged; nothing is invoiced, charged or sent by merging.</p>
      </div>
      <CanonicalSubscriptionMergeForm customerId={customer.id} customerLabel={label} candidates={candidates} />
    </div>
  );
}
