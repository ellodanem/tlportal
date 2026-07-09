"use client";

import { useState } from "react";

import type { PaymentDeclineEmailPreview } from "@/lib/stripe/payment-failure-messaging";

export function PaymentDeclineEmailPreviewToggle({ preview }: { preview: PaymentDeclineEmailPreview }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-white/80 dark:border-zinc-600 dark:bg-zinc-950/40">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Email preview
        <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-600">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Subject:</span> {preview.subject}
          </p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            {preview.text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
