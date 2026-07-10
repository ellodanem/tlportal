import Link from "next/link";

const tabs = [
  { segment: "", label: "Overview" },
  { segment: "billing", label: "Billing" },
  { segment: "messages", label: "Messages" },
] as const;

export function CustomerSubnav({
  customerId,
  active,
}: {
  customerId: string;
  active: "overview" | "billing" | "messages";
}) {
  return (
    <nav
      className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      aria-label="Customer sections"
    >
      {tabs.map((tab) => {
        const href =
          tab.segment === ""
            ? `/admin/customers/${customerId}`
            : `/admin/customers/${customerId}/${tab.segment}`;
        const isActive = (tab.segment === "" && active === "overview") || tab.segment === active;
        return (
          <Link
            key={tab.segment || "overview"}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
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
