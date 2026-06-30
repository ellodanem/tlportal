"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";

export const ADMIN_CREATE_ITEMS = [
  {
    href: "/admin/quotes/new",
    label: "Quote",
    description: "Download a PDF estimate without Invoiless.",
    section: "sales",
  },
  {
    href: "/admin/tl-invoices/new",
    label: "TL invoice",
    description: "One-off invoice for cash, cheque, or bank payers.",
    section: "billing",
  },
  {
    href: "/admin/recurring-invoices/new",
    label: "Recurring schedule",
    description: "Auto-bill cash/cheque customers on a monthly or quarterly cadence.",
    section: "billing",
  },
  {
    href: "/admin/expenses/new",
    label: "Expense",
    description: "Record a vendor payment with optional receipt.",
    section: "billing",
  },
  {
    href: "/admin/proposals/new",
    label: "Proposal",
    description: "Start a sales proposal with default sections.",
    section: "sales",
  },
  {
    href: "/admin/customers/new",
    label: "Customer",
    description: "Add a company or person for billing.",
    section: "overview",
  },
  {
    href: "/admin/devices/new",
    label: "Register device",
    description: "Add a tracker or gateway to the fleet.",
    section: "fleet",
  },
  {
    href: "/admin/device-models/new",
    label: "Device model",
    description: "Add a product to the catalog for registration.",
    section: "fleet",
  },
  {
    href: "/admin/sims/new",
    label: "SIM card",
    description: "Provision or link a cellular SIM.",
    section: "fleet",
  },
] as const;

export type AdminCreateSection = (typeof ADMIN_CREATE_ITEMS)[number]["section"];

export function adminCreateItemsForSection(section: AdminCreateSection) {
  return ADMIN_CREATE_ITEMS.filter((item) => item.section === section);
}

type CreateMenuItem = (typeof ADMIN_CREATE_ITEMS)[number];

function useDismissOnOutsideClick(open: boolean, onClose: () => void, containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    if (!open) return;
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, onClose, open]);
}

function CreateMenuDropdown({
  items,
  placement = "below",
  onClose,
}: {
  items: readonly CreateMenuItem[];
  placement?: "below" | "beside" | "section";
  onClose: () => void;
}) {
  const placementClass =
    placement === "beside"
      ? "absolute left-full top-0 z-50 ml-1 w-60 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
      : placement === "section"
        ? "absolute right-0 top-full z-50 mt-1 w-60 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
        : "absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40";

  return (
    <div className={placementClass} role="menu">
      {items.map(({ href, label, description }) => (
        <Link
          key={href}
          href={href}
          role="menuitem"
          className="block rounded-lg px-3 py-2.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={onClose}
        >
          <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</span>
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
        </Link>
      ))}
    </div>
  );
}

export function AdminSectionCreateMenu({
  section,
  sectionLabel,
}: {
  section: AdminCreateSection;
  sectionLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const items = adminCreateItemsForSection(section);

  useDismissOnOutsideClick(open, () => setOpen(false), containerRef);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-6 w-6 items-center justify-center rounded text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200"
        title={`Create in ${sectionLabel}`}
      >
        <span aria-hidden>+</span>
        <span className="sr-only">Create in {sectionLabel}</span>
      </button>
      {open ? <CreateMenuDropdown items={items} placement="section" onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export function AdminCreateMenu({ sidebarCollapsed = false }: { sidebarCollapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsideClick(open, () => setOpen(false), containerRef);

  return (
    <div ref={containerRef} className={`relative ${sidebarCollapsed ? "flex justify-center" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-600 bg-white text-lg font-medium leading-none text-emerald-800 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
      >
        <span aria-hidden>+</span>
        <span className="sr-only">Create new…</span>
      </button>
      {open ? (
        <CreateMenuDropdown
          items={ADMIN_CREATE_ITEMS}
          placement={sidebarCollapsed ? "beside" : "below"}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
