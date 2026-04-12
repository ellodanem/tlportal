"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const items = [
  {
    href: "/admin/customers/new",
    label: "Customer",
    description: "Add a company or person for billing.",
  },
  {
    href: "/admin/devices/new",
    label: "Register device",
    description: "Add a tracker or gateway to the fleet.",
  },
  {
    href: "/admin/device-models/new",
    label: "Device model",
    description: "Add a product to the catalog for registration.",
  },
  {
    href: "/admin/sims/new",
    label: "SIM card",
    description: "Provision or link a cellular SIM.",
  },
] as const;

export function AdminCreateMenu({ sidebarCollapsed = false }: { sidebarCollapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (!open) return;
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${sidebarCollapsed ? "flex justify-center" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-600 bg-white text-lg font-medium leading-none text-emerald-800 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
      >
        <span aria-hidden>+</span>
        <span className="sr-only">Create new…</span>
      </button>
      {open ? (
        <div
          className={
            sidebarCollapsed
              ? "absolute left-full top-0 z-50 ml-1 w-60 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
              : "absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
          }
          role="menu"
        >
          {items.map(({ href, label, description }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              className="block rounded-lg px-3 py-2.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setOpen(false)}
            >
              <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</span>
              <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
