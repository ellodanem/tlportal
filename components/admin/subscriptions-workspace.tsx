"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type {
  CustomerGroupView,
  SubscriptionRowView,
  WorkspaceSortDirection,
  WorkspaceSortKey,
  WorkspaceStatusView,
} from "@/lib/domain/canonical-subscription-workspace";

type Option = { value: string; label: string };

export type SubscriptionsWorkspaceProps = {
  groups: CustomerGroupView[];
  filters: { query: string; status: string; cadence: string; sort: WorkspaceSortKey; dir: WorkspaceSortDirection };
  statusOptions: Option[];
  cadenceOptions: Option[];
  filtered: boolean;
  isEmpty: boolean;
  counts: { subscriptions: number; customers: number };
  sortLinks: Record<WorkspaceSortKey, { href: string; direction: WorkspaceSortDirection | null }>;
  pagination: { page: number; pageCount: number; from: number; to: number; previousHref: string | null; nextHref: string | null };
};

type ExtraColumns = { collection: boolean; reference: boolean };

const AVATAR_TINTS = [
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
];

function avatarTint(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

const TONE_CLASSES: Record<WorkspaceStatusView["tone"], { pill: string; dot: string }> = {
  active: { pill: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", dot: "bg-emerald-500" },
  attention: { pill: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", dot: "bg-amber-500" },
  alert: { pill: "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300", dot: "bg-rose-500" },
  paused: { pill: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300", dot: "bg-sky-500" },
  neutral: { pill: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", dot: "bg-zinc-400" },
  ended: { pill: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400", dot: "bg-zinc-400" },
};

function StatusPill({ status }: { status: WorkspaceStatusView }) {
  const tone = TONE_CLASSES[status.tone];
  return (
    <span
      title={status.detail ?? undefined}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.pill}`}
    >
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
      <span className="truncate">{status.label}</span>
    </span>
  );
}

function Icon({ path, className = "size-4" }: { path: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  );
}
const CHEVRON_RIGHT = "m9 5 7 7-7 7";
const CHEVRON_DOWN = "m6 9 6 6 6-6";
const SEARCH = "M21 21l-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z";
const COLUMNS = "M4 5h16v14H4zM9.5 5v14M14.5 5v14";

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function gridTemplate(extra: ExtraColumns): string {
  const columns = [
    "minmax(0,2.6fr)", "minmax(5rem,0.8fr)", "minmax(8.25rem,1fr)", "minmax(7rem,1fr)",
  ];
  if (extra.collection) columns.push("minmax(6.5rem,0.9fr)");
  if (extra.reference) columns.push("minmax(6rem,0.9fr)");
  columns.push("minmax(8rem,0.9fr)", "1.5rem");
  return columns.join(" ");
}

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5 lg:gap-x-4 lg:[grid-template-columns:var(--cols)]";
const NAME = "break-words lg:truncate";
const STRETCH =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-emerald-600";

function SortHeader({
  label, sortKey, link, className = "",
}: {
  label: string;
  sortKey: WorkspaceSortKey;
  link: { href: string; direction: WorkspaceSortDirection | null };
  className?: string;
}) {
  const ariaSort = link.direction === "asc" ? "ascending" : link.direction === "desc" ? "descending" : "none";
  return (
    <div role="columnheader" aria-sort={ariaSort} className={className}>
      <Link
        href={link.href}
        scroll={false}
        data-sort-key={sortKey}
        className={`-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-zinc-100 ${link.direction ? "text-zinc-900 dark:text-zinc-100" : ""}`}
      >
        {label}
        <span aria-hidden="true" className="text-[10px] leading-none">
          {link.direction === "asc" ? "\u25B2" : link.direction === "desc" ? "\u25BC" : "\u21C5"}
        </span>
      </Link>
    </div>
  );
}

function Recurring({ amount, period }: { amount: string | null; period: string | null }) {
  if (!amount) return <span className="text-zinc-400 dark:text-zinc-600">{"\u2014"}</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{amount}</span>
      {period ? <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">{period}</span> : null}
    </span>
  );
}

function Muted({ value }: { value: string | null }) {
  const empty = !value || value === "\u2014";
  return <span className={empty ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-700 dark:text-zinc-300"}>{value || "\u2014"}</span>;
}

/** Shared cells for the three row types so columns line up exactly. */
function RowCells({
  services, recurring, recurringPeriod, nextCycle, collection, reference, status, extra, action,
}: {
  services: string;
  recurring: string | null;
  recurringPeriod: string | null;
  nextCycle: string;
  collection: string;
  reference: string | null;
  status: WorkspaceStatusView;
  extra: ExtraColumns;
  action: React.ReactNode;
}) {
  return (
    <>
      <div className="order-3 col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 lg:order-none lg:contents lg:text-sm dark:text-zinc-400">
        <div role="cell" className="text-zinc-700 lg:text-sm dark:text-zinc-300">{services}</div>
        <div role="cell" className="lg:text-sm"><Recurring amount={recurring} period={recurringPeriod} /></div>
        <div role="cell" className="lg:text-sm"><Muted value={nextCycle} /></div>
      </div>
      {extra.collection ? <div role="cell" className="hidden text-sm lg:block"><Muted value={collection} /></div> : null}
      {extra.reference ? <div role="cell" className="hidden truncate text-sm lg:block" title={reference ?? undefined}><Muted value={reference} /></div> : null}
      <div role="cell" className="order-2 flex items-center justify-end gap-1 lg:order-none lg:justify-start">
        <StatusPill status={status} />
      </div>
      <div role="cell" className="order-2 hidden justify-end text-zinc-400 lg:order-none lg:flex dark:text-zinc-500">{action}</div>
    </>
  );
}

function Avatar({ initials, tint }: { initials: string; tint: string }) {
  return (
    <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold ${tint}`}>
      {initials}
    </span>
  );
}

function SingleRow({ group, extra }: { group: CustomerGroupView; extra: ExtraColumns }) {
  const subscription = group.subscriptions[0];
  return (
    <div role="row" data-row="single" className={`relative hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${ROW_GRID}`}>
      <div role="cell" className="order-1 flex min-w-0 items-center gap-3 lg:order-none">
        <span className="size-4 shrink-0" aria-hidden="true" />
        <Avatar initials={group.initials} tint={avatarTint(group.key)} />
        <div className="min-w-0">
          <Link href={subscription.href} className={`block text-sm font-semibold text-zinc-900 dark:text-zinc-50 ${NAME} ${STRETCH}`}>
            {group.customer}
            <span className="sr-only">, open subscription {subscription.name}</span>
          </Link>
          <p className="text-xs text-zinc-500 lg:truncate dark:text-zinc-400">{group.context}</p>
        </div>
      </div>
      <RowCells
        services={group.servicesLabel} recurring={group.recurring} recurringPeriod={group.recurringPeriod}
        nextCycle={group.nextCycle} collection={group.collection} reference={group.reference}
        status={group.status} extra={extra} action={<Icon path={CHEVRON_RIGHT} />}
      />
    </div>
  );
}

function ChildRow({ subscription, extra, last }: { subscription: SubscriptionRowView; extra: ExtraColumns; last: boolean }) {
  return (
    <div role="row" data-row="subscription" className={`relative hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${ROW_GRID}`}>
      <div role="cell" className="order-1 flex min-w-0 items-center gap-3 lg:order-none">
        {/* Tree connector keeps the subscription visually attached to its customer. */}
        <span aria-hidden="true" className="w-3 shrink-0 lg:hidden" />
        <span aria-hidden="true" className="relative ml-[2.1rem] hidden w-[2.65rem] shrink-0 self-stretch lg:block">
          <span className={`absolute left-[0.75rem] top-[-0.75rem] w-px bg-zinc-200 dark:bg-zinc-700 ${last ? "h-[calc(50%+0.75rem)]" : "h-[calc(100%+1.5rem)]"}`} />
          <span className="absolute left-[0.75rem] top-1/2 h-px w-4 bg-zinc-200 dark:bg-zinc-700" />
        </span>
        <div className="min-w-0">
          <Link href={subscription.href} className={`block text-sm font-medium text-zinc-800 dark:text-zinc-100 ${NAME} ${STRETCH}`}>
            {subscription.name}
          </Link>
          <p className="text-xs text-zinc-500 lg:truncate dark:text-zinc-400">{subscription.cadence}</p>
        </div>
      </div>
      <RowCells
        services={subscription.servicesLabel} recurring={subscription.recurring} recurringPeriod={subscription.recurringPeriod}
        nextCycle={subscription.nextCycle} collection={subscription.collection} reference={subscription.reference}
        status={subscription.status} extra={extra} action={<Icon path={CHEVRON_RIGHT} />}
      />
    </div>
  );
}

function GroupRows({
  group, open, onToggle, extra,
}: {
  group: CustomerGroupView;
  open: boolean;
  onToggle: () => void;
  extra: ExtraColumns;
}) {
  const panelId = `customer-subscriptions-${group.key}`;
  return (
    <>
      <div role="row" data-row="group" className={`relative hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${ROW_GRID}`}>
        <div role="cell" className="order-1 flex min-w-0 items-center gap-3 lg:order-none">
          <Icon path={open ? CHEVRON_DOWN : CHEVRON_RIGHT} className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
          <Avatar initials={group.initials} tint={avatarTint(group.key)} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={panelId}
              className={`block max-w-full text-left text-sm font-semibold text-zinc-900 dark:text-zinc-50 ${NAME} ${STRETCH}`}
            >
              {group.customer}
              <span className="sr-only">, {open ? "collapse" : "expand"} subscriptions</span>
            </button>
            <p className="text-xs text-zinc-500 lg:truncate dark:text-zinc-400">{group.context}</p>
          </div>
        </div>
        <RowCells
          services={group.servicesLabel} recurring={group.recurring} recurringPeriod={group.recurringPeriod}
          nextCycle={group.nextCycle} collection={group.collection} reference={group.reference}
          status={group.status} extra={extra} action={null}
        />
      </div>
      <div id={panelId} role="rowgroup" hidden={!open} className="divide-y divide-zinc-100 border-t border-zinc-100 bg-zinc-50/40 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/40">
        {group.subscriptions.map((subscription, index) => (
          <ChildRow key={subscription.id} subscription={subscription} extra={extra} last={index === group.subscriptions.length - 1} />
        ))}
      </div>
    </>
  );
}

/** Expansion state lives here; the parent re-keys it whenever the result set changes. */
function CustomerRows({ groups, defaultOpen, extra }: { groups: CustomerGroupView[]; defaultOpen: boolean; extra: ExtraColumns }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  return (
    <>
      {groups.map((group) => (
        <div key={group.key} data-customer={group.key} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
          {group.kind === "single" ? (
            <SingleRow group={group} extra={extra} />
          ) : (
            <GroupRows
              group={group}
              extra={extra}
              open={overrides[group.key] ?? defaultOpen}
              onToggle={() => setOverrides((current) => ({ ...current, [group.key]: !(current[group.key] ?? defaultOpen) }))}
            />
          )}
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function SelectControl({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-zinc-200 bg-white pl-3 pr-8 text-sm text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <Icon path={CHEVRON_DOWN} className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
    </label>
  );
}

function ColumnsMenu({ extra, onChange }: { extra: ExtraColumns; onChange: (next: ExtraColumns) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={container} className="relative hidden lg:block">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        <Icon path={COLUMNS} />
        Columns
      </button>
      {open ? (
        <div role="group" aria-label="Optional columns" className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="px-2 py-1 text-xs font-medium text-zinc-500">Show additional columns</p>
          {([["collection", "Collection method"], ["reference", "Reference"]] as const).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <input
                type="checkbox"
                checked={extra[key]}
                onChange={(event) => onChange({ ...extra, [key]: event.target.checked })}
                className="size-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
              />
              {label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

export function SubscriptionsWorkspace(props: SubscriptionsWorkspaceProps) {
  const { groups, filters, filtered, counts, pagination } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query);
  const [extra, setExtra] = useState<ExtraColumns>({ collection: false, reference: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function navigate(next: { q?: string; status?: string; cadence?: string }) {
    const params = new URLSearchParams();
    const q = (next.q ?? query).trim();
    const status = next.status ?? filters.status;
    const cadence = next.cadence ?? filters.cadence;
    if (q) params.set("q", q);
    if (status && status !== "all") params.set("status", status);
    if (cadence) params.set("cadence", cadence);
    if (filters.sort !== "customer") params.set("sort", filters.sort);
    if (filters.dir === "desc") params.set("dir", "desc");
    const search = params.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }));
  }

  function onSearchChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value }), 350);
  }

  function clearAll() {
    setQuery("");
    if (timer.current) clearTimeout(timer.current);
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  const resultKey = [filters.query, filters.status, filters.cadence, filters.sort, filters.dir, pagination.page].join("|");
  const template = gridTemplate(extra);
  const hasRows = groups.length > 0;

  return (
    <section aria-label="Subscriptions" className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-3 sm:p-4 lg:flex-row lg:items-center dark:border-zinc-800">
        <form
          role="search"
          onSubmit={(event) => { event.preventDefault(); if (timer.current) clearTimeout(timer.current); navigate({ q: query }); }}
          className="relative min-w-0 flex-1"
        >
          <label htmlFor="subscription-search" className="sr-only">Search customer, subscription or reference</label>
          <Icon path={SEARCH} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            id="subscription-search"
            type="search"
            value={query}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search customer, subscription or reference"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </form>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <SelectControl label="Status" value={filters.status} options={props.statusOptions} onChange={(status) => navigate({ status })} />
          <SelectControl
            label="Billing frequency"
            value={filters.cadence}
            options={[{ value: "", label: "All frequencies" }, ...props.cadenceOptions]}
            onChange={(cadence) => navigate({ cadence })}
          />
          <ColumnsMenu extra={extra} onChange={setExtra} />
        </div>
        <p className="text-sm text-zinc-500 lg:ml-1 lg:min-w-28 lg:text-right dark:text-zinc-400" aria-live="polite">
          {counts.subscriptions} subscription{counts.subscriptions === 1 ? "" : "s"}
        </p>
      </div>

      {props.isEmpty ? (
        <div className="px-5 py-16 text-center">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">No subscriptions yet</h2>
          <p className="mt-1 text-sm text-zinc-500">Subscriptions you add will appear here, grouped by customer.</p>
        </div>
      ) : !hasRows ? (
        <div className="px-5 py-16 text-center">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">No matching subscriptions</h2>
          <p className="mt-1 text-sm text-zinc-500">Try a different search, status, or billing frequency.</p>
          <button type="button" onClick={clearAll} className="mt-4 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Clear search and filters
          </button>
        </div>
      ) : (
        <div role="table" aria-label="Subscriptions by customer" aria-busy={pending} style={{ "--cols": template } as React.CSSProperties} className={`transition-opacity ${pending ? "opacity-60" : ""}`}>
          <div role="rowgroup" className="hidden border-b border-zinc-100 bg-zinc-50/70 text-xs font-medium text-zinc-500 lg:block dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
            <div role="row" className={ROW_GRID.replace("py-3", "py-2")}>
              <SortHeader label="Customer / Subscription" sortKey="customer" link={props.sortLinks.customer} className="pl-[4.75rem]" />
              <SortHeader label="Services" sortKey="services" link={props.sortLinks.services} />
              <SortHeader label="Recurring" sortKey="recurring" link={props.sortLinks.recurring} />
              <SortHeader label="Next cycle" sortKey="renewal" link={props.sortLinks.renewal} />
              {extra.collection ? <div role="columnheader">Collection</div> : null}
              {extra.reference ? <div role="columnheader">Reference</div> : null}
              <SortHeader label="Status" sortKey="status" link={props.sortLinks.status} />
              <div role="columnheader"><span className="sr-only">Open</span></div>
            </div>
          </div>
          <CustomerRows key={resultKey} groups={groups} defaultOpen={filtered} extra={extra} />
        </div>
      )}

      {hasRows ? (
        <div className="flex flex-col gap-3 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-zinc-800 dark:text-zinc-400">
          <p>
            {pagination.from}&ndash;{pagination.to} of {counts.customers} customer{counts.customers === 1 ? "" : "s"}
            <span className="hidden sm:inline"> &middot; click a row to open or expand it</span>
          </p>
          {pagination.pageCount > 1 ? (
            <nav aria-label="Subscriptions pagination" className="flex items-center gap-2">
              <span className="mr-1 text-xs">Page {pagination.page} of {pagination.pageCount}</span>
              {([["Previous", pagination.previousHref, "m15 5-7 7 7 7"], ["Next", pagination.nextHref, CHEVRON_RIGHT]] as const).map(([label, href, path]) =>
                href ? (
                  <Link key={label} href={href} scroll={false} aria-label={`${label} page`} className="grid size-9 place-items-center rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <Icon path={path} />
                  </Link>
                ) : (
                  <span key={label} aria-hidden="true" className="grid size-9 place-items-center rounded-lg border border-zinc-100 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
                    <Icon path={path} />
                  </span>
                ),
              )}
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
