import type { Prisma } from "@prisma/client";

import { CustomerDetail, type SnapshotSubscription } from "@/components/admin/customer-new/customer-detail";
import { customerSubscriptionsPath } from "@/lib/admin/customer-subscriptions-path";
import { CustomerListPane, type CustomerListRow } from "@/components/admin/customer-new/customer-list-pane";
import { CustomerPanel } from "@/components/admin/customer-new/customer-panel";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerInitials } from "@/lib/admin/customer-list";
import {
  CUSTOMER_NEW_LIST_LIMIT,
  currentSubscriptionWhere,
  customerNewAddress,
  customerNewBillingMethod,
  customerNewCollectionLabel,
  customerNewHref,
  parseCustomerNewFilter,
} from "@/lib/admin/customer-new";
import { prisma } from "@/lib/db";
import { canonicalIntervalLabel, canonicalSubscriptionDisplayName, canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { getCanonicalSubscriptionAdminDetail } from "@/lib/services/canonical-subscription-admin-service";
import { listOperationalEventsForCustomer } from "@/lib/services/operational-event-service";

type Props = { searchParams: Promise<{ c?: string; q?: string; filter?: string }> };

type SubscriptionDetail = NonNullable<Awaited<ReturnType<typeof getCanonicalSubscriptionAdminDetail>>>;

function sumByCurrency(entries: { amount: number; currency: string }[]): string {
  const totals = new Map<string, number>();
  for (const { amount, currency } of entries) {
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  if (totals.size === 0) return formatExpenseAmount(0, "XCD");
  return [...totals.entries()].map(([currency, amount]) => formatExpenseAmount(amount, currency)).join(" + ");
}

function snapshotTone(sub: SubscriptionDetail): Pick<SnapshotSubscription, "statusLabel" | "tone"> {
  if (sub.summary?.attentionRequired) return { statusLabel: "Needs attention", tone: "amber" };
  if (sub.lifecycleStatus === "active") return { statusLabel: "Active", tone: "emerald" };
  if (sub.lifecycleStatus === "paused") return { statusLabel: "Paused", tone: "zinc" };
  return { statusLabel: "Pending", tone: "blue" };
}

export default async function CustomerNewPage({ searchParams }: Props) {
  const { c: rawSelected, q: rawQuery, filter: rawFilter } = await searchParams;
  const q = rawQuery?.trim() ?? "";
  const filter = parseCustomerNewFilter(rawFilter);

  const where: Prisma.CustomerWhereInput = {
    ...activeCustomerWhere,
    ...(q
      ? {
          OR: [
            { company: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filter === "subscribed" ? { customerSubscriptions: { some: currentSubscriptionWhere } } : {}),
    ...(filter === "none" ? { customerSubscriptions: { none: currentSubscriptionWhere } } : {}),
  };

  const listed = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      customerSubscriptions: { where: currentSubscriptionWhere, select: { id: true } },
    },
  });

  // Open balance per listed customer (one grouped query, not one per row).
  const balances = await prisma.invoice.groupBy({
    by: ["customerId", "currency"],
    where: {
      customerId: { in: listed.map((c) => c.id) },
      status: { in: ["open", "partially_paid", "overdue"] },
    },
    _sum: { amountDue: true },
  });
  const balancesByCustomer = new Map<string, { amount: number; currency: string }[]>();
  for (const b of balances) {
    if (!b.customerId) continue;
    const list = balancesByCustomer.get(b.customerId) ?? [];
    list.push({ amount: Number(b._sum.amountDue ?? 0), currency: b.currency });
    balancesByCustomer.set(b.customerId, list);
  }

  const allRows: CustomerListRow[] = listed
    .map((c) => {
      const owed = balancesByCustomer.get(c.id) ?? [];
      return {
        id: c.id,
        name: customerDisplayName(c),
        email: c.email,
        phone: c.phone?.trim() || null,
        initials: customerInitials(c),
        hasSubscription: c.customerSubscriptions.length > 0,
        subscriptionCount: c.customerSubscriptions.length,
        outstanding: sumByCurrency(owed),
        hasOutstanding: owed.some((o) => o.amount > 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const rows = allRows.slice(0, CUSTOMER_NEW_LIST_LIMIT);

  // The list is always the page. A customer opens in a slide-over only when `?c=` is present
  // (full screen on phones), so the URL is shareable and Back / refresh work.
  const selectedId = rawSelected ?? null;

  const customer = selectedId
    ? await prisma.customer.findUnique({
        where: { id: selectedId },
        include: {
          contacts: { orderBy: [{ isBillingContact: "desc" }, { createdAt: "asc" }], take: 1 },
          customerSubscriptions: { where: currentSubscriptionWhere, select: { id: true }, orderBy: { createdAt: "asc" } },
          _count: { select: { portalUsers: true } },
        },
      })
    : null;

  const listHref = customerNewHref({ q, filter });
  const selectedIndex = selectedId ? rows.findIndex((r) => r.id === selectedId) : -1;
  const prevId = selectedIndex > 0 ? rows[selectedIndex - 1].id : null;
  const nextId = selectedIndex >= 0 && selectedIndex < rows.length - 1 ? rows[selectedIndex + 1].id : null;

  let detail: React.ReactNode = (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 sm:p-10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      Customer not found.
    </div>
  );
  let panelTitle = "Customer";

  if (customer) {
    const [loaded, openInvoices, events] = await Promise.all([
      Promise.all(customer.customerSubscriptions.map((s) => getCanonicalSubscriptionAdminDetail(s.id))),
      prisma.invoice.findMany({
        where: { customerId: customer.id, status: { in: ["open", "partially_paid", "overdue"] } },
        select: { amountDue: true, currency: true },
      }),
      listOperationalEventsForCustomer(customer.id, 4),
    ]);
    const subs = loaded.filter((s): s is SubscriptionDetail => s != null);

    const services = subs.reduce(
      (sum, s) => sum + s.items.filter((item) => !["ended", "canceled"].includes(item.status)).length,
      0,
    );
    const nextRenewal =
      subs
        .map((s) => s.nextBillingDate)
        .filter((d): d is Date => d != null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const collection = [...new Set(subs.map((s) => customerNewCollectionLabel(s.collectionMethod)))].join(" + ");

    const canonicalUi = canonicalSubscriptionUiVisible();
    const subscriptionHref = (subscriptionId: string) =>
      canonicalUi ? `/admin/subscriptions/canonical/${subscriptionId}` : `/admin/subscriptions/${customer.id}`;
    // One subscription opens directly; several open the Subscriptions list narrowed to this customer.
    const subscriptionsHref = canonicalUi
      ? customerSubscriptionsPath(customer.id, subs.map((s) => s.id))
      : `/admin/subscriptions/${customer.id}`;
    const createSubscriptionHref = `/admin/subscriptions/new?customerId=${encodeURIComponent(customer.id)}`;

    const contact = customer.contacts[0] ?? null;
    panelTitle = customerDisplayName(customer);

    detail = (
      <CustomerDetail
        subscriptionsHref={subscriptionsHref}
        createSubscriptionHref={createSubscriptionHref}
        hasSubscription={subs.length > 0}
        customer={{
          id: customer.id,
          name: customerDisplayName(customer),
          initials: customerInitials(customer),
          isBusiness: Boolean(customer.company?.trim()),
          createdAt: customer.createdAt,
          email: customer.email,
          phone: customer.phone,
          address: customerNewAddress(customer),
          billingMethod: customerNewBillingMethod(customer.billingMode),
          portalEnabled: customer._count.portalUsers > 0 || Boolean(customer.traqcareClientId?.trim()),
          notes: customer.notes,
          tags: customer.tags,
          archived: customer.archivedAt != null,
          primaryContact: contact
            ? { name: contact.name, role: contact.role, email: contact.email, phone: contact.phone }
            : null,
        }}
        outstanding={{
          label: sumByCurrency(openInvoices.map((i) => ({ amount: Number(i.amountDue), currency: i.currency }))),
          openInvoices: openInvoices.length,
        }}
        stats={{
          subscriptionCount: subs.length,
          monthlyValue: sumByCurrency(
            subs.map((s) => ({ amount: Number(s.normalizedMrr ?? 0), currency: s.currency ?? "XCD" })),
          ),
          nextRenewal,
          services,
          collection: collection || "—",
        }}
        subscriptions={subs.map((s) => ({
          id: s.id,
          name: canonicalSubscriptionDisplayName(s.name, s.billingIntervalMonths),
          detail: `${customerNewCollectionLabel(s.collectionMethod)} · ${canonicalIntervalLabel(s.billingIntervalMonths)}`,
          href: subscriptionHref(s.id),
          ...snapshotTone(s),
        }))}
        events={events}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CustomerListPane rows={rows} total={allRows.length} selectedId={selectedId} q={q} filter={filter} />
      {allRows.length > rows.length ? (
        <p className="text-xs text-zinc-500">
          Showing the first {rows.length} of {allRows.length} customers. Use search to narrow the list.
        </p>
      ) : null}
      {selectedId ? (
        <CustomerPanel
          title={panelTitle}
          closeHref={listHref}
          prevHref={prevId ? customerNewHref({ c: prevId, q, filter }) : null}
          nextHref={nextId ? customerNewHref({ c: nextId, q, filter }) : null}
        >
          {detail}
        </CustomerPanel>
      ) : null}
    </div>
  );
}
