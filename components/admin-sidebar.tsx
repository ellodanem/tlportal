"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminCreateMenu } from "@/components/admin-create-menu";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/sims", label: "SIMs" },
] as const;

function navClass(active: boolean) {
  return active
    ? "rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
    : "rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50";
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 px-4 py-5 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <Link href="/admin" className="mt-1 block text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          TL Portal
        </Link>
      </div>
      <div className="relative px-3 pt-1">
        <AdminCreateMenu />
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {links.map(({ href, label }) => {
          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={navClass(active)}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Subscription and device alerts will appear here as we wire monitoring.
        </p>
      </div>
    </aside>
  );
}
