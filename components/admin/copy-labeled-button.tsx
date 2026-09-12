"use client";

import { useCallback, useState } from "react";

type Props = {
  value: string;
  label: string;
  className?: string;
};

export function CopyLabeledButton({ value, label, className = "" }: Props) {
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

  const text = status === "copied" ? "Copied" : status === "error" ? "Copy failed" : label;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!value}
      className={`inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40 ${className}`}
    >
      {text}
    </button>
  );
}
