"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { CloseIcon } from "@/components/admin/canonical-subscription/icons";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Red styling is reserved for destructive confirmations. */
  tone?: "neutral" | "danger";
  /** While an operation is running the dialog cannot be dismissed. */
  busy?: boolean;
  size?: "md" | "lg";
  /** Element to focus on close if the opener is no longer enabled (e.g. its action just completed). */
  fallbackFocusId?: string;
  children: ReactNode;
};

/**
 * Accessible modal for one focused service operation: labelled, focus moves in, Tab stays inside,
 * Escape and the close button dismiss it (unless an operation is in flight), and focus returns to
 * whatever opened it. Mounted only while open, so every open starts from a clean form.
 */
export function ServiceActionDialog({ onClose, title, description, tone = "neutral", busy = false, size = "md", fallbackFocusId, children }: Props) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descriptionId = `${uid}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      const openerUsable = opener && opener !== document.body && opener.isConnected && !(opener as HTMLButtonElement).disabled;
      const fallback = fallbackFocusId ? document.getElementById(fallbackFocusId) : null;
      const target = openerUsable ? opener : fallback && !(fallback as HTMLButtonElement).disabled ? fallback : document.getElementById("service-heading");
      target?.focus();
    };
  }, [fallbackFocusId]);

  // A step change unmounts the button that had focus; pull focus back into the dialog so keyboard and
  // screen-reader users are not stranded on <body>.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new MutationObserver(() => {
      if (document.activeElement === document.body || !document.activeElement) panel.focus();
    });
    observer.observe(panel, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Listen on the document (not the panel): when a multi-step dialog swaps steps the focused button
  // is unmounted and focus drops to <body>, where a panel-level handler would never see Escape/Tab.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!active || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={`max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 text-left shadow-xl outline-none sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:p-6 dark:bg-zinc-900 ${size === "lg" ? "max-w-2xl" : "max-w-lg"} ${tone === "danger" ? "border-red-200 dark:border-red-900/60" : "border-zinc-200 dark:border-zinc-700"}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className={`text-lg font-semibold tracking-tight ${tone === "danger" ? "text-red-900 dark:text-red-100" : ""}`}>{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={`Close ${title}`}
            className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
