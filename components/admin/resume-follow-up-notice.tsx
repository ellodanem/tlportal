"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ResumeFollowUp } from "@/lib/domain/resume-follow-up";

/** Shown in place of the resume button; the page refreshes only when staff dismiss it. */
export function ResumeFollowUpNotice({ followUp, compact = false }: { followUp: ResumeFollowUp | null | undefined; compact?: boolean }) {
  const router = useRouter();
  if (!followUp) return null;
  return (
    <div
      role="alert"
      className={`rounded-md border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 ${compact ? "px-2 py-1.5 text-xs" : "mb-3 px-3 py-2 text-sm"}`}
    >
      <p><span className="font-semibold">Next step:</span> {followUp.text}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <Link href={followUp.href} className="inline-block py-1 font-semibold text-emerald-800 underline dark:text-emerald-300">{followUp.linkLabel}</Link>
        <button type="button" onClick={() => router.refresh()} className="py-1 font-medium text-zinc-600 hover:underline dark:text-zinc-300">Done</button>
      </div>
    </div>
  );
}
