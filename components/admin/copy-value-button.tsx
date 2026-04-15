"use client";

import { useCallback, useState } from "react";

type Props = {
  value: string;
  /** Short name for tooltips / aria, e.g. "IMEI", "ICCID" */
  kind: string;
  className?: string;
};

export function CopyValueButton({ value, kind, className = "" }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  }, [value]);

  const title =
    status === "copied" ? `${kind} copied` : status === "error" ? `Could not copy ${kind}` : `Copy ${kind}`;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white p-1 text-zinc-500 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="stroke-current">
        <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
