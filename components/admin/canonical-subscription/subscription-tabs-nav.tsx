"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { activeSubscriptionTab, type SubscriptionTab } from "@/lib/domain/canonical-subscription-navigation";

/** Real-route tabs. Each tab is a link, so every section is directly linkable and keyboard reachable. */
export function SubscriptionTabsNav({ tabs }: { tabs: SubscriptionTab[] }) {
  const active = activeSubscriptionTab(useSelectedLayoutSegment());
  return (
    <nav aria-label="Subscription sections" className="-mx-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
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
