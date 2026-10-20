import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  canonicalIntervalLabel,
  canonicalSubscriptionUiVisible,
} from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import { listCanonicalManualPilotCandidates } from "@/lib/services/canonical-manual-pilot-review-service";

function statusClass(status: string) {
  if (status === "ready_for_review") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  if (status === "needs_confirmation") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
}

export default async function CanonicalManualPilotCandidatesPage() {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const candidates = await listCanonicalManualPilotCandidates();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Back to subscriptions
        </Link>
        <p className="mt-4 text-xs font-medium text-zinc-500">Billing / First customer pilot</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Manual-billing pilot review</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Review one legacy recurring arrangement at a time. Listing and previewing are read-only; ambiguous records remain blocked until their terms are explicitly confirmed.
        </p>
      </div>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-semibold">No production customer is selected automatically</p>
        <p className="mt-1">Phase 4A prepares and tests the workflow with synthetic data. A real customer requires a separate owner-reviewed authorization.</p>
      </section>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          No verified manual schedules or established manual-invoice arrangements are available for review.
        </div>
      ) : (
        <div className="grid gap-3">
          {candidates.map((candidate) => (
            <article key={candidate.proposalId} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{candidate.customerLabel}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(candidate.reviewStatus)}`}>
                      {candidate.reviewStatus.replaceAll("_", " ")}
                    </span>
                    {candidate.migrationStatus ? (
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold capitalize text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                        Migration {candidate.migrationStatus.replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {candidate.sourceKind === "manual_schedule"
                      ? `Schedule ${candidate.sourceScheduleId}`
                      : `Established invoice ${candidate.sourceInvoiceId}`}
                  </p>
                </div>
                {candidate.targetSubscriptionId ? (
                  <Link href={`/admin/subscriptions/canonical/${candidate.targetSubscriptionId}`} className="rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-semibold text-emerald-700 dark:border-zinc-700 dark:text-emerald-400">
                    Open migrated shadow
                  </Link>
                ) : (
                  <Link href={`/admin/subscriptions/canonical/pilot/${encodeURIComponent(candidate.proposalId)}`} className="rounded-lg bg-emerald-700 px-4 py-2 text-center text-sm font-semibold text-white">
                    Review arrangement
                  </Link>
                )}
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div><dt className="text-zinc-500">Collection</dt><dd className="mt-1 font-medium">Manual invoice</dd></div>
                <div><dt className="text-zinc-500">Frequency</dt><dd className="mt-1 font-medium">{canonicalIntervalLabel(candidate.billingIntervalMonths)}</dd></div>
                <div><dt className="text-zinc-500">Current cycle</dt><dd className="mt-1 font-medium tabular-nums">{candidate.recurringAmount == null ? "Unresolved" : formatExpenseAmount(Number(candidate.recurringAmount), candidate.currency)}</dd></div>
                <div><dt className="text-zinc-500">Next renewal</dt><dd className="mt-1 font-medium">{candidate.nextBillingDate ? new Date(candidate.nextBillingDate).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) : "Unresolved"}</dd></div>
                <div><dt className="text-zinc-500">Mapped services</dt><dd className="mt-1 font-medium">{candidate.proposedItemCount}</dd></div>
              </dl>
              {candidate.issueDetails.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-300"><li className="list-none font-medium text-zinc-700 dark:text-zinc-200">Review flags</li>{candidate.issueDetails.map((issue) => <li key={`${issue.code}:${issue.message}`}>{issue.message}</li>)}</ul> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
