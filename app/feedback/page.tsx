import type { Metadata } from "next";

import { FeedbackForm } from "@/components/feedback/feedback-form";

export const metadata: Metadata = {
  title: "Feedback — Track Lucia",
  description: "Share a note with the Track Lucia team.",
};

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="mx-auto max-w-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- public brand mark, not admin blob */}
        <img
          src="/track-lucia-logo.jpg"
          alt="Track Lucia"
          width={416}
          height={416}
          className="mx-auto h-auto w-52 sm:w-60"
        />
        <h1 className="mt-6 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Share your feedback
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
          A note for our team. If you give permission, we may share your name and comment.
        </p>

        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <FeedbackForm />
        </div>
      </div>
    </div>
  );
}
