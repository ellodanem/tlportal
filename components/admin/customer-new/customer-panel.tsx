"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const barButtonClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 sm:size-10 dark:text-zinc-200 dark:hover:bg-zinc-800";
const disabledBarButtonClass = "pointer-events-none opacity-30";

function Chevron({ direction }: { direction: "left" | "right" | "up" | "down" }) {
  const rotate = { right: "", left: "rotate-180", down: "rotate-90", up: "-rotate-90" }[direction];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-5 ${rotate}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Right-hand slide-over that hosts one customer's detail on top of the customers list.
 *
 * The open customer lives in the URL (`?c=`), so refresh, Back and shared links all work; this component only
 * adds the chrome: backdrop, slide-in, Esc / backdrop to close, previous / next customer, and an Expand toggle.
 * Phones always get the full screen. From `md` up the panel is ~65% wide until expanded.
 */
export function CustomerPanel({
  title,
  closeHref,
  prevHref,
  nextHref,
  children,
}: {
  title: string;
  closeHref: string;
  prevHref: string | null;
  nextHref: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Esc closes. Keep the list's scroll position by not scrolling on navigation.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, closeHref]);

  // Lock the page behind the panel; restore on close.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Move focus into the panel when it opens.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Moving to another customer starts at the top of the new detail.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [title]);

  return (
    <div className="fixed inset-0 z-40">
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close customer panel"
        tabIndex={-1}
        className="cn-backdrop-in absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px] dark:bg-black/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`cn-panel-in absolute inset-y-0 right-0 flex w-full flex-col bg-zinc-50 shadow-2xl outline-none transition-[width] duration-200 ease-out dark:bg-zinc-950 ${
          expanded ? "md:w-full" : "md:w-[min(65%,64rem)] md:rounded-l-2xl md:border-l md:border-zinc-200 md:dark:border-zinc-800"
        }`}
      >
        <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1.5 sm:px-3 dark:border-zinc-800 dark:bg-zinc-900">
          <Link
            href={closeHref}
            scroll={false}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 sm:min-h-10 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            <Chevron direction="left" />
            <span>
              <span className="sm:hidden">All customers</span>
              <span className="hidden sm:inline">Back to customers</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-0.5">
            <Link
              href={prevHref ?? closeHref}
              scroll={false}
              aria-label="Previous customer"
              aria-disabled={prevHref ? undefined : true}
              tabIndex={prevHref ? undefined : -1}
              className={`${barButtonClass} ${prevHref ? "" : disabledBarButtonClass}`}
            >
              <Chevron direction="up" />
            </Link>
            <Link
              href={nextHref ?? closeHref}
              scroll={false}
              aria-label="Next customer"
              aria-disabled={nextHref ? undefined : true}
              tabIndex={nextHref ? undefined : -1}
              className={`${barButtonClass} ${nextHref ? "" : disabledBarButtonClass}`}
            >
              <Chevron direction="down" />
            </Link>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-pressed={expanded}
              className="ml-1 hidden min-h-10 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 md:inline-flex dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {expanded ? (
                  <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                ) : (
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                )}
              </svg>
              {expanded ? "Collapse" : "Expand"}
            </button>
            <Link
              href={closeHref}
              scroll={false}
              aria-label="Close"
              className={`${barButtonClass} ml-1`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Link>
          </div>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
