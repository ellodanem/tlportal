import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SubscriptionsWorkspace } from "@/components/admin/subscriptions-workspace";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import {
  customerGroupView,
  parseWorkspaceSearchParams,
  WORKSPACE_DEFAULT_PAGE_SIZE,
  WORKSPACE_STATUS_FILTERS,
  WORKSPACE_STATUS_LABELS,
  type WorkspaceSortDirection,
  type WorkspaceSortKey,
} from "@/lib/domain/canonical-subscription-workspace";
import { formatMoney } from "@/lib/domain/native-billing";
import {
  canonicalSubscriptionUiStaffViewer,
  getCanonicalSubscriptionWorkspace,
} from "@/lib/services/canonical-subscription-admin-service";

type Props = {
  searchParams: Promise<{ q?: string; status?: string; view?: string; cadence?: string; sort?: string; dir?: string; page?: string }>;
};

const BASE_PATH = "/admin/subscriptions/canonical";

/** First click on a column sorts the useful way round: biggest / most urgent first for numbers. */
const DEFAULT_DIRECTION: Record<WorkspaceSortKey, WorkspaceSortDirection> = {
  customer: "asc", services: "desc", recurring: "desc", renewal: "asc", status: "asc",
};

function href(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `${BASE_PATH}?${value}` : BASE_PATH;
}

function SummaryIcon({ path, tone }: { path: string; tone: string }) {
  return (
    <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full ${tone}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d={path} />
      </svg>
    </span>
  );
}

const TILE = "flex items-center gap-3 bg-white px-5 py-4 dark:bg-zinc-900";
const TILE_LINK = `${TILE} transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:hover:bg-zinc-800/40`;
const LABEL = "text-xs font-medium text-zinc-500 dark:text-zinc-400";
const VALUE = "mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50";

export default async function SubscriptionsPage({ searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");

  const parsed = parseWorkspaceSearchParams(await searchParams);
  const workspace = await getCanonicalSubscriptionWorkspace({
    query: parsed.query,
    status: parsed.status,
    cadence: parsed.cadence,
    sort: parsed.sort,
    direction: parsed.direction,
    page: parsed.page,
    pageSize: WORKSPACE_DEFAULT_PAGE_SIZE,
  });
  const { metrics } = workspace;

  const groups = workspace.groups.map((group) => customerGroupView(group, { money: formatMoney }));
  const cadenceValue = parsed.cadence == null ? "" : String(parsed.cadence);
  const filtered = Boolean(parsed.query) || parsed.status !== "all" || parsed.cadence != null;

  const filterParams = { q: parsed.query, status: parsed.status === "all" ? null : parsed.status, cadence: cadenceValue };
  const sortParams = (key: WorkspaceSortKey, direction: WorkspaceSortDirection) =>
    key === "customer" && direction === "asc" ? {} : { sort: key, dir: direction === "desc" ? "desc" : null };
  const sortLinks = Object.fromEntries((["customer", "services", "recurring", "renewal", "status"] as const).map((key) => {
    const active = parsed.sort === key;
    const next = active ? (parsed.direction === "asc" ? "desc" : "asc") : DEFAULT_DIRECTION[key];
    return [key, { href: href({ ...filterParams, ...sortParams(key, next) }), direction: active ? parsed.direction : null }];
  })) as Record<WorkspaceSortKey, { href: string; direction: WorkspaceSortDirection | null }>;
  const pageParams = { ...filterParams, ...sortParams(parsed.sort, parsed.direction) };

  const from = groups.length ? (workspace.page - 1) * workspace.pageSize + 1 : 0;
  const mrrValue = metrics.operationalMrr == null
    ? "\u2014"
    : formatMoney(metrics.operationalMrr, metrics.operationalMrrCurrency ?? "XCD");

  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Subscriptions</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Manage customer subscriptions and recurring services.</p>
      </div>
      <Link
        href="/admin/subscriptions/canonical/new"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-4"><path d="M12 5v14M5 12h14" /></svg>
        Add subscription
      </Link>
    </header>

    <section aria-label="Subscription summary" className="grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
      <Link href={href({})} className={`${TILE_LINK}`} title="Subscription records, not customers or services. Click to clear filters.">
        <SummaryIcon tone="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" path="M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6" />
        <div><p className={LABEL}>Total subscriptions</p><p className={VALUE}>{metrics.totalCount}</p></div>
      </Link>
      <Link href={href({ status: "active" })} className={`${TILE_LINK}`} title="Show active subscriptions">
        <SummaryIcon tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" path="M5 12l4.5 4.5L19 7" />
        <div><p className={LABEL}>Active</p><p className={VALUE}>{metrics.activeCount}</p></div>
      </Link>
      <div className={`${TILE}`} title={metrics.operationalMrr == null
        ? "Active subscriptions span more than one currency, so no single total is shown."
        : "Normalized monthly value of active canonical subscriptions."}>
        <SummaryIcon tone="bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" path="M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.8 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3" />
        <div><p className={LABEL}>Operational MRR</p><p className={VALUE}>{mrrValue}</p></div>
      </div>
      <Link href={href({ status: "attention" })} className={TILE_LINK} title="Show subscriptions that need setup, review, or collection follow-up">
        <SummaryIcon
          tone={metrics.needsAttentionCount > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}
          path="M12 4l9 16H3zM12 10v4M12 17h.01"
        />
        <div><p className={LABEL}>Needs attention</p><p className={VALUE}>{metrics.needsAttentionCount}</p></div>
      </Link>
    </section>

    <SubscriptionsWorkspace
      groups={groups}
      filters={{ query: parsed.query, status: parsed.status, cadence: cadenceValue, sort: parsed.sort, dir: parsed.direction }}
      statusOptions={WORKSPACE_STATUS_FILTERS.map((value) => ({ value, label: WORKSPACE_STATUS_LABELS[value] }))}
      cadenceOptions={workspace.cadenceOptions}
      filtered={filtered}
      isEmpty={workspace.isEmpty}
      counts={{ subscriptions: workspace.subscriptionTotal, customers: workspace.groupTotal }}
      sortLinks={sortLinks}
      pagination={{
        page: workspace.page,
        pageCount: workspace.pageCount,
        from,
        to: from ? from + groups.length - 1 : 0,
        previousHref: workspace.page > 1 ? href({ ...pageParams, page: workspace.page - 1 }) : null,
        nextHref: workspace.page < workspace.pageCount ? href({ ...pageParams, page: workspace.page + 1 }) : null,
      }}
    />

    <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
      Related:{" "}
      <Link href="/admin/subscriptions/attention" className="font-medium hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">Attention queue</Link>
      {" \u00b7 "}
      <Link href="/admin/subscriptions/canonical/migrations" className="font-medium hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">Migration history</Link>
      {" \u00b7 "}
      <Link href="/admin/subscriptions/legacy" className="font-medium hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">Legacy records</Link>
      {" \u00b7 "}
      <Link href="/admin/reports" className="font-medium hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">Reports</Link>
    </p>
  </div>;
}
