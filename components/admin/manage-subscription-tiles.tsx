import Link from "next/link";

/**
 * Zone C — intent-grouped entry points for the billing tab. Tiles are quick
 * navigation to the existing functional panels rendered below (anchors), so
 * staff pick a task rather than scanning one large form.
 */
export function ManageSubscriptionTiles() {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Manage subscription</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Tile
          href="#payment-link"
          title="Send payment link"
          subtitle="New or lapsed customers · opens Checkout"
          icon={<LinkIcon />}
        />
        <Tile
          href="#payment-link"
          title="Change vehicles"
          subtitle="Update quantity · may sync to Stripe"
          icon={<UsersIcon />}
        />
        <Tile
          href="#payment-link"
          title="Edit plan"
          subtitle="Tier & term · preview before charge"
          icon={<DocIcon />}
        />
        <Tile
          href="#renewal-ops"
          title="Adjust renewal"
          subtitle="Next due dates · TL ops, optional Stripe"
          icon={<CalendarIcon />}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <Link
          href="#payment-link"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-emerald-700 dark:text-zinc-300 dark:hover:text-emerald-400"
        >
          <ExternalIcon className="h-4 w-4" />
          Open customer billing portal
        </Link>
        <Link
          href="#billing-settings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-emerald-700 dark:text-zinc-300 dark:hover:text-emerald-400"
        >
          <GearIcon className="h-4 w-4" />
          Billing settings
        </Link>
      </div>
    </section>
  );
}

function Tile({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3.5 transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</span>
      </span>
      <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-emerald-500 dark:text-zinc-600" />
    </Link>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5" aria-hidden>
      <path d="M8 11a3 3 0 004.2.3l2.3-2.3a3 3 0 00-4.2-4.2l-1 1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9a3 3 0 00-4.2-.3L5.5 11a3 3 0 004.2 4.2l1-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5" aria-hidden>
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M3 15a4.5 4.5 0 019 0" strokeLinecap="round" />
      <path d="M13 5.2a2.5 2.5 0 010 4.6M14 15a4.5 4.5 0 00-1.8-3.6" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5" aria-hidden>
      <path d="M5.5 2.5h6l3 3v12h-9z" strokeLinejoin="round" />
      <path d="M11.5 2.5v3h3M7.5 9h5M7.5 12h5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5" aria-hidden>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8h14M7 3v3M13 3v3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path d="M8 5l4 5-4 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden>
      <path d="M11 4h5v5M16 4l-7 7M8 5H5a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden>
      <circle cx="10" cy="10" r="2.5" />
      <path
        d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
