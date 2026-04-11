import Link from "next/link";
import { notFound } from "next/navigation";

import { RegistrationReviewForms } from "@/components/admin/registration-review-forms";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

function formatWhen(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RegistrationRequestDetailPage({ params }: Props) {
  const { id } = await params;
  const r = await prisma.registrationRequest.findUnique({
    where: { id },
    include: {
      subscriptionOption: { select: { label: true } },
      matchesCustomer: { select: { id: true, company: true, firstName: true, lastName: true, email: true } },
      createdCustomer: { select: { id: true } },
      reviewedBy: { select: { email: true, name: true } },
    },
  });
  if (!r) {
    notFound();
  }

  const dup = Boolean(r.matchesCustomerId) || r.otherPendingSameEmail > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/registration-requests"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Registration requests
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Registration</h1>
          <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            {r.status}
          </span>
          {dup ? (
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-200">
              Duplicate check
            </span>
          ) : null}
        </div>
        <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{r.id}</p>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Submission</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Submitted</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-50">{formatWhen(r.submittedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-50">
                {r.firstName} {r.lastName}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Phone</dt>
              <dd className="text-right font-mono text-zinc-900 dark:text-zinc-50">{r.phone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
              <dd className="break-all text-right font-mono text-xs text-zinc-900 dark:text-zinc-50">{r.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Subscription (form)</dt>
              <dd className="max-w-[60%] text-right text-zinc-900 dark:text-zinc-50">
                {r.subscriptionOption?.label ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Vehicle details</dt>
              <dd className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-100">
                {r.vehicleDetails}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Terms</dt>
              <dd className="mt-2 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                <p>After payment / install scheduling: {r.termInstallAfterPayment ? "Yes" : "No"}</p>
                <p>Hardware fee per vehicle: {r.termHardwarePerVehicle ? "Yes" : "No"}</p>
                <p>Travel fee may apply: {r.termTravelFee ? "Yes" : "No"}</p>
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Review</h2>
            {dup ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-medium">Duplicate flags</p>
                {r.matchesCustomer ? (
                  <p className="mt-1 text-xs">
                    Email matches existing customer{" "}
                    <Link
                      href={`/admin/customers/${r.matchesCustomer.id}`}
                      className="font-medium text-emerald-800 underline dark:text-emerald-300"
                    >
                      {customerDisplayName(r.matchesCustomer)}
                    </Link>
                    . Approval is blocked until that situation is resolved.
                  </p>
                ) : (
                  <p className="mt-1 text-xs">No existing customer with this email at submission time.</p>
                )}
                {r.otherPendingSameEmail > 0 ? (
                  <p className="mt-2 text-xs">
                    At submission time, {r.otherPendingSameEmail} other pending request(s) shared this email — review
                    before approving.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No duplicate email match at submission.</p>
            )}

            {r.status === "pending" ? (
              <div className="mt-6">
                <RegistrationReviewForms registrationId={r.id} />
              </div>
            ) : (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Reviewed</dt>
                  <dd className="text-right text-zinc-900 dark:text-zinc-50">{formatWhen(r.reviewedAt)}</dd>
                </div>
                {r.reviewedBy ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500 dark:text-zinc-400">Reviewer</dt>
                    <dd className="text-right text-zinc-900 dark:text-zinc-50">{r.reviewedBy.name ?? r.reviewedBy.email}</dd>
                  </div>
                ) : null}
                {r.status === "rejected" && r.rejectionReason ? (
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Rejection reason</dt>
                    <dd className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-100">
                      {r.rejectionReason}
                    </dd>
                  </div>
                ) : null}
                {r.createdCustomer ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500 dark:text-zinc-400">Created customer</dt>
                    <dd className="text-right">
                      <Link
                        href={`/admin/customers/${r.createdCustomer.id}/edit`}
                        className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        Open customer
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
