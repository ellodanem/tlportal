"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Centered dialog on desktop, bottom sheet on phones. Controlled by the parent so the
 * parent can close it after a successful action.
 */
export function InvoiceActionModal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[calc(100dvh-1rem)] w-full ${maxWidthClass} overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-xl sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </h2>
            {description ? <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</div> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const INVOICE_ACTION_BUTTON_CLASS =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";
