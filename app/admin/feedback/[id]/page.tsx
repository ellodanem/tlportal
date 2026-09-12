import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyLabeledButton } from "@/components/admin/copy-labeled-button";
import { FeedbackReviewForms } from "@/components/admin/feedback-review-forms";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { prisma } from "@/lib/db";
import { formatFeedbackCaption, formatFeedbackQuote } from "@/lib/feedback/share-copy";
import { feedbackStatusLabel } from "@/lib/feedback/status";

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

function stars(rating: number | null) {
  if (rating == null) return "—";
  return `${rating} / 5 (${"★".repeat(rating)}${"☆".repeat(5 - rating)})`;
}

export default async function FeedbackDetailPage({ params }: Props) {
  const { id } = await params;
  const r = await prisma.feedbackSubmission.findUnique({
    where: { id },
    include: {
      matchesCustomer: { select: { id: true, company: true, firstName: true, lastName: true, email: true } },
      reviewedBy: { select: { email: true, name: true } },
    },
  });
  if (!r) {
    notFound();
  }

  const quote = formatFeedbackQuote({
    body: r.body,
    displayName: r.displayName,
    sharePermission: r.sharePermission,
  });
  const caption = formatFeedbackCaption({
    body: r.body,
    displayName: r.displayName,
    sharePermission: r.sharePermission,
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/feedback" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Feedback
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Feedback</h1>
          <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            {feedbackStatusLabel(r.status)}
          </span>
          {r.sharePermission ? (
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
              Shareable
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-200">
              Private
            </span>
          )}
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
              <dd className="text-right text-zinc-900 dark:text-zinc-50">{r.displayName?.trim() || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Rating</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-50">{stars(r.rating)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
              <dd className="break-all text-right font-mono text-xs text-zinc-900 dark:text-zinc-50">{r.email || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Phone</dt>
              <dd className="text-right font-mono text-zinc-900 dark:text-zinc-50">{r.phone || "—"}</dd>
            </div>
            {r.matchesCustomer ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Customer match</dt>
                <dd className="text-right">
                  <Link
                    href={`/admin/customers/${r.matchesCustomer.id}`}
                    className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                  >
                    {customerDisplayName(r.matchesCustomer)}
                  </Link>
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Message</dt>
              <dd className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-100">
                {r.body}
              </dd>
            </div>
            {r.reviewedAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Last reviewed</dt>
                <dd className="text-right text-zinc-900 dark:text-zinc-50">
                  {formatWhen(r.reviewedAt)}
                  {r.reviewedBy ? ` · ${r.reviewedBy.name ?? r.reviewedBy.email}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Share</h2>
            {r.sharePermission && quote && caption ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Quote</p>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-100">
                    {quote}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Caption</p>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm text-zinc-900 dark:bg-zinc-950/60 dark:text-zinc-100">
                    {caption}
                  </pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyLabeledButton value={quote} label="Copy quote" />
                  <CopyLabeledButton value={caption} label="Copy caption" />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                Private — not cleared to share. Copy actions stay off for this submission.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Review</h2>
            <div className="mt-4">
              <FeedbackReviewForms id={r.id} sharePermission={r.sharePermission} adminNote={r.adminNote ?? ""} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
