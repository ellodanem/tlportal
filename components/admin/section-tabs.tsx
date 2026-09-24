import Link from "next/link";

export type SectionTab = {
  id: string;
  label: string;
};

export function SectionTabs({
  tabs,
  active,
  hrefFor,
  ariaLabel,
}: {
  tabs: readonly SectionTab[];
  active: string;
  hrefFor: (id: string) => string;
  ariaLabel: string;
}) {
  return (
    <nav
      className="-mb-px flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            scroll={false}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? "border-emerald-600 text-emerald-800 dark:border-emerald-500 dark:text-emerald-300"
                : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
