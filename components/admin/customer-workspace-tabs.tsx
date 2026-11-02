"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { activeCustomerWorkspaceTab, CUSTOMER_WORKSPACE_TABS, customerWorkspacePath } from "@/lib/admin/customer-workspace-path";

/** Real-route tabs for the customer workspace in Subscriptions. Every tab is a plain link. */
export function CustomerWorkspaceTabs({ customerId }: { customerId: string }) {
  const active = activeCustomerWorkspaceTab(useSelectedLayoutSegment());
  return (
    <nav aria-label="Customer sections" className="-mx-1 mt-4 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
      <ul className="flex min-w-max gap-1 px-1">
        {CUSTOMER_WORKSPACE_TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={customerWorkspacePath(customerId, tab.key)}
                aria-current={isActive ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${isActive ? "border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300" : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
