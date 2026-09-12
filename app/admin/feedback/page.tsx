import Link from "next/link";
import type { FeedbackStatus } from "@prisma/client";

import { CopyFeedbackLinkButton } from "@/components/admin/copy-feedback-link-button";
import { prisma } from "@/lib/db";
import {
  feedbackListWhere,
  feedbackStatusLabel,
  parseFeedbackListFilter,
  type FeedbackListFilter,
} from "@/lib/feedback/status";

type Props = { searchParams: Promise<{ filter?: string }> };

function formatWhen(d: Date) {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function filterHref(filter: FeedbackListFilter) {
  return filter === "new" ? "/admin/feedback" : `/admin/feedback?filter=${filter}`;
}

function filterClass(active: boolean) {
  return active
    ? "rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white dark:bg-emerald-600"
    : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
}

function stars(rating: number | null) {
  if (rating == null) return "—";
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function previewBody(body: string) {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= 90) return t;
  return `${t.slice(0, 89).trimEnd()}…`;
}

const FILTERS: { id: FeedbackListFilter; label: string }[] = [
  { id: "new", label: "New" },
  { id: "featured", label: "Featured" },
  { id: "private", label: "Private" },
  { id: "all", label: "All" },
];

function StatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {feedbackStatusLabel(status)}
    </span>
  );
}

export default async function FeedbackInboxPage({ searchParams }: Props) {
  const params = await searchParams;
  const filter = parseFeedbackListFilter(params.filter);
  const rows = await prisma.feedbackSubmission.findMany({
    where: feedbackListWhere(filter),
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      body: true,
      rating: true,
      displayName: true,
      sharePermission: true,
      submittedAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Feedback</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Public submissions from{" "}
          <Link className="text-emerald-700 underline dark:text-emerald-400" href="/feedback">
            /feedback
          </Link>
          . <CopyFeedbackLinkButton />{" "}
          <span className="max-md:mt-1 max-md:block md:contents">
            Review privately, then copy quotes that visitors cleared for sharing.
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.id} href={filterHref(f.id)} className={filterClass(filter === f.id)}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No feedback in this view yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.sharePermission ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                      Shareable
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-200">
                      Private
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {r.displayName?.trim() || "Anonymous"}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{previewBody(r.body)}</p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatWhen(r.submittedAt)} · {stars(r.rating)}
                </p>
                <Link
                  href={`/admin/feedback/${r.id}`}
                  className="mt-3 inline-flex min-h-11 items-center font-medium text-emerald-800 dark:text-emerald-300"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No feedback in this view yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatWhen(r.submittedAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">{r.displayName?.trim() || "Anonymous"}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{stars(r.rating)}</td>
                  <td className="px-4 py-3">
                    {r.sharePermission ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                        Shareable
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-200">
                        Private
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/feedback/${r.id}`}
                      className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
