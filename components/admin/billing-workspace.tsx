import Link from "next/link";
import type { InvoiceStatus, QuoteStatus } from "@prisma/client";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";
import {
  formatMoney,
  INVOICE_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  PAYMENT_METHOD_LABELS,
  QUOTE_STATUS_LABELS,
} from "@/lib/domain/native-billing";
import { displayInvoiceNumber } from "@/lib/domain/native-billing-cutover";
import { summarizeBillingWorkspace, type WorkspaceNativeInvoice } from "@/lib/billing/billing-workspace-read-model";

export type BillingWorkspaceView = "invoices" | "quotations" | "reminders" | "statements";
type SearchParams = { view?: string; q?: string; currency?: string };

const ACTIVE_STATUSES: InvoiceStatus[] = ["open", "partially_paid", "paid", "overdue"];

function href(path: string, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return query.size ? `${path}?${query}` : path;
}

function Pill({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "amber" | "rose" | "emerald" }) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    rose: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
    emerald: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function Tabs({ active }: { active: BillingWorkspaceView }) {
  const tabs = [
    ["/admin/billing", "Invoices", "invoices"],
    ["/admin/billing/quotations", "Quotations", "quotations"],
    ["/admin/billing/reminders", "Reminders", "reminders"],
    ["/admin/billing/statements", "Statements", "statements"],
  ] as const;
  return (
    <nav className="flex overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900" aria-label="Billing">
      {tabs.map(([path, label, id]) => (
        <Link key={id} href={path} className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold ${active === id ? "bg-emerald-50 text-emerald-900 shadow-sm dark:bg-emerald-950/50 dark:text-emerald-100" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BillingWorkspaceHeader({ active, title, subtitle, primaryHref, primaryLabel }: { active: BillingWorkspaceView; title: string; subtitle: string; primaryHref?: string; primaryLabel?: string }) {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Admin <span className="mx-2 text-zinc-300">/</span> Billing</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        </div>
        {primaryHref && primaryLabel ? <Link href={primaryHref} className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500">+ {primaryLabel}</Link> : null}
      </div>
      <Tabs active={active} />
    </>
  );
}

function SummaryCard({ label, value, detail, tone = "zinc" }: { label: string; value: string; detail: string; tone?: "zinc" | "amber" | "rose" | "emerald" }) {
  const tones = { zinc: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900", amber: "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20", rose: "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20", emerald: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20" };
  return <section className={`rounded-xl border p-4 ${tones[tone]}`}><p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{value}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{detail}</p></section>;
}

function normalizeProviderStatus(status: string) {
  const value = status.toLowerCase();
  if (value === "paid") return "emerald" as const;
  if (value === "past_due" || value === "uncollectible" || value === "failed") return "rose" as const;
  if (value === "open" || value === "pending") return "amber" as const;
  return "zinc" as const;
}

export async function BillingWorkspace({ view, searchParams = {} }: { view: Exclude<BillingWorkspaceView, "statements">; searchParams?: SearchParams }) {
  if (view === "quotations") return <QuotationsWorkspace searchParams={searchParams} />;
  if (view === "reminders") return <RemindersWorkspace />;
  return <InvoicesWorkspace searchParams={searchParams} />;
}

async function InvoicesWorkspace({ searchParams }: { searchParams: SearchParams }) {
  const query = searchParams.q?.trim() ?? "";
  const selectedView = ["all", "unpaid", "draft", "open", "partially_paid", "overdue", "paid"].includes(searchParams.view ?? "") ? searchParams.view ?? "all" : "all";
  const match = query ? { OR: [
    { number: { contains: query, mode: "insensitive" as const } },
    { legacyInvoiceNumber: { contains: query, mode: "insensitive" as const } },
    { billToName: { contains: query, mode: "insensitive" as const } },
    { customerSubscriptionId: { contains: query, mode: "insensitive" as const } },
    { customer: { is: { company: { contains: query, mode: "insensitive" as const } } } },
    { customer: { is: { firstName: { contains: query, mode: "insensitive" as const } } } },
    { customer: { is: { lastName: { contains: query, mode: "insensitive" as const } } } },
  ] } : {};
  const [nativeInvoices, providerInvoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { archivedAt: null, status: { in: [...ACTIVE_STATUSES, "draft"] }, ...match }, orderBy: { updatedAt: "desc" }, take: 250, select: { id: true, number: true, legacyInvoiceNumber: true, kind: true, status: true, billToName: true, total: true, amountDue: true, amountPaid: true, currency: true, dueDate: true, customer: { select: { id: true, company: true, firstName: true, lastName: true } } } }),
    prisma.billingInvoice.findMany({ where: { nativeMirror: { is: null } }, orderBy: { updatedAt: "desc" }, take: 250, select: { id: true, displayNumber: true, providerInvoiceNumber: true, externalInvoiceId: true, status: true, amountXcd: true, currency: true, hostedInvoiceUrl: true, customer: { select: { id: true, company: true, firstName: true, lastName: true } } } }),
    prisma.payment.findMany({ where: { voidedAt: null }, orderBy: { receivedAt: "desc" }, take: 5, select: { id: true, amount: true, currency: true, method: true, receivedAt: true, invoice: { select: { id: true, number: true, legacyInvoiceNumber: true } }, customer: { select: { company: true, firstName: true, lastName: true } } } }),
  ]);
  const currencies = Array.from(new Set([...nativeInvoices.map((row) => row.currency.toUpperCase()), ...providerInvoices.map((row) => row.currency.toUpperCase())])).sort();
  const selectedCurrency = currencies.includes((searchParams.currency ?? "").toUpperCase()) ? (searchParams.currency ?? "").toUpperCase() : currencies[0] ?? "XCD";
  const native = nativeInvoices.filter((row) => row.currency.toUpperCase() === selectedCurrency);
  const nativeFinancial = native.filter((row) => row.status !== "draft");
  const providers = providerInvoices.filter((row) => row.currency.toUpperCase() === selectedCurrency);
  const rows = native.filter((row) => selectedView === "all" || (selectedView === "unpaid" ? ["open", "partially_paid", "overdue"].includes(row.status) : row.status === selectedView));
  const summary = summarizeBillingWorkspace({
    currency: selectedCurrency,
    nativeInvoices: nativeFinancial.map((row) => ({ currency: row.currency, status: row.status as WorkspaceNativeInvoice["status"], total: Number(row.total), amountPaid: Number(row.amountPaid), amountDue: Number(row.amountDue) })),
    providerInvoices: providers.map((row) => ({ currency: row.currency, status: row.status, amount: Number(row.amountXcd) })),
  });
  const outstandingRows = native.filter((row) => ["open", "partially_paid", "overdue"].includes(row.status));
  const overdueRows = native.filter((row) => row.status === "overdue");
  const filterCounts = { all: native.length, unpaid: outstandingRows.length, draft: native.filter((row) => row.status === "draft").length, open: native.filter((row) => row.status === "open").length, partially_paid: native.filter((row) => row.status === "partially_paid").length, overdue: overdueRows.length, paid: native.filter((row) => row.status === "paid").length };

  return <div className="flex flex-col gap-6">
    <BillingWorkspaceHeader active="invoices" title="Billing" subtitle="Manage invoices, payments and collections." primaryHref="/admin/tl-invoices/new" primaryLabel="New invoice" />
    {currencies.length > 1 ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100"><strong>Currency</strong>{currencies.map((currency) => <Link key={currency} href={href("/admin/billing", { q: query || undefined, view: selectedView === "all" ? undefined : selectedView, currency })} className={`rounded-md px-2.5 py-1 font-semibold ${currency === selectedCurrency ? "bg-amber-200/80 dark:bg-amber-900/60" : "hover:bg-amber-100 dark:hover:bg-amber-900/30"}`}>{currency}</Link>)}<span className="text-xs">Totals are shown per currency and are never converted or combined.</span></div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Total invoiced" value={formatMoney(summary.totalInvoiced, selectedCurrency)} detail="Finalized native and unmatched paid provider invoices" /><SummaryCard label="Outstanding" value={formatMoney(summary.outstanding, selectedCurrency)} detail={`${summary.outstandingCount} confirmed native receivables`} tone="amber" /><SummaryCard label="Overdue" value={formatMoney(summary.overdue, selectedCurrency)} detail={`${summary.overdueCount} native invoices needing follow-up`} tone="rose" /><SummaryCard label="Collected" value={formatMoney(summary.collected, selectedCurrency)} detail="Recorded payments, all time" tone="emerald" /></div>
    <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"><form method="get" action="/admin/billing" className="flex flex-col gap-3 sm:flex-row"><input type="hidden" name="currency" value={selectedCurrency} /><label className="min-w-0 flex-1"><span className="sr-only">Search invoices</span><input name="q" defaultValue={query} placeholder="Search invoice, customer or subscription ID" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /></label><button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Search</button>{query ? <Link href={href("/admin/billing", { currency: selectedCurrency })} className="rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-semibold dark:border-zinc-700">Clear</Link> : null}</form><nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Invoice status filters">{Object.entries(filterCounts).map(([id, count]) => <Link key={id} href={href("/admin/billing", { q: query || undefined, currency: selectedCurrency, view: id === "all" ? undefined : id })} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedView === id ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>{id === "all" ? "All" : id.replaceAll("_", " ")} ({count})</Link>)}</nav></section>
    <InvoicesTable rows={rows} />
    {providers.length ? <ProviderInvoicesTable rows={providers} /> : null}
    <PaymentsTable rows={payments} />
  </div>;
}

function InvoicesTable({ rows }: { rows: Array<{ id: string; number: string | null; legacyInvoiceNumber: string | null; kind: keyof typeof INVOICE_KIND_LABELS; status: InvoiceStatus; billToName: string | null; total: unknown; amountDue: unknown; currency: string; dueDate: Date | null; customer: { id: string; company: string | null; firstName: string | null; lastName: string | null } | null }> }) {
  return <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Invoices</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Native accounts receivable. Provider-managed invoices are intentionally separated below.</p></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold"><Link href={`/admin/tl-invoices/${row.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">{displayInvoiceNumber(row)}</Link></td><td className="px-4 py-3">{row.customer ? <Link href={`/admin/customers/${row.customer.id}/billing`} className="hover:underline">{customerDisplayName(row.customer)}</Link> : row.billToName ?? "-"}</td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{INVOICE_KIND_LABELS[row.kind]}</td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.dueDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "-"}</td><td className="px-4 py-3 tabular-nums"><div>{formatMoney(Number(row.total), row.currency)}</div>{Number(row.amountDue) > 0 ? <div className="text-xs text-zinc-500">{formatMoney(Number(row.amountDue), row.currency)} due</div> : null}</td><td className="px-4 py-3"><span className={invoiceStatusBadgeClass(row.status)}>{INVOICE_STATUS_LABELS[row.status]}</span></td><td className="px-4 py-3 text-right"><Link href={`/admin/tl-invoices/${row.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>)}{rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">No matching native invoices.</td></tr> : null}</tbody></table></div></section>;
}

function ProviderInvoicesTable({ rows }: { rows: Array<{ id: string; displayNumber: string | null; providerInvoiceNumber: string | null; externalInvoiceId: string; status: string; amountXcd: unknown; currency: string; hostedInvoiceUrl: string | null; customer: { id: string; company: string | null; firstName: string | null; lastName: string | null } }> }) {
  return <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Provider-managed invoices</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Stripe remains the payment authority. Open provider balances are not added to Outstanding because the stored mirror has no reliable remaining-balance field.</p></div><div className="overflow-x-auto"><table className="min-w-[700px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Billed</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Authority</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium">{row.displayNumber ?? row.providerInvoiceNumber ?? row.externalInvoiceId}</td><td className="px-4 py-3"><Link href={`/admin/customers/${row.customer.id}/billing`} className="hover:underline">{customerDisplayName(row.customer)}</Link></td><td className="px-4 py-3 tabular-nums">{formatMoney(Number(row.amountXcd), row.currency)}</td><td className="px-4 py-3"><Pill tone={normalizeProviderStatus(row.status)}>{row.status.replaceAll("_", " ")}</Pill></td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">Stripe</td><td className="px-4 py-3 text-right">{row.hostedInvoiceUrl ? <a href={row.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View in Stripe</a> : <Link href={`/admin/customers/${row.customer.id}/billing`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Review</Link>}</td></tr>)}</tbody></table></div></section>;
}

function PaymentsTable({ rows }: { rows: Array<{ id: string; amount: unknown; currency: string; method: keyof typeof PAYMENT_METHOD_LABELS; receivedAt: Date; invoice: { id: string; number: string | null; legacyInvoiceNumber: string | null }; customer: { company: string | null; firstName: string | null; lastName: string | null } | null }> }) {
  return <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Recent payment activity</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Recorded native payments only; Stripe payment activity stays on the provider-managed invoice.</p></div><div className="overflow-x-auto"><table className="min-w-[680px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.receivedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="px-4 py-3"><Link href={`/admin/tl-invoices/${row.invoice.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">{displayInvoiceNumber(row.invoice)}</Link></td><td className="px-4 py-3">{row.customer ? customerDisplayName(row.customer) : "-"}</td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{PAYMENT_METHOD_LABELS[row.method]}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(Number(row.amount), row.currency)}</td></tr>)}{rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">No recorded payments yet.</td></tr> : null}</tbody></table></div></section>;
}

async function QuotationsWorkspace({ searchParams }: { searchParams: SearchParams }) {
  const query = searchParams.q?.trim() ?? "";
  const statuses = ["all", "draft", "sent", "accepted", "declined", "expired", "converted"] as const;
  const selected = statuses.includes(searchParams.view as (typeof statuses)[number]) ? searchParams.view! : "all";
  const quotes = await prisma.quote.findMany({
    where: {
      ...(selected === "all" ? {} : { status: selected as QuoteStatus }),
      ...(query ? { OR: [
        { number: { contains: query, mode: "insensitive" } },
        { billToName: { contains: query, mode: "insensitive" } },
        { customer: { is: { company: { contains: query, mode: "insensitive" } } } },
        { customer: { is: { firstName: { contains: query, mode: "insensitive" } } } },
        { customer: { is: { lastName: { contains: query, mode: "insensitive" } } } },
      ] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 250,
    select: { id: true, number: true, status: true, billToName: true, total: true, currency: true, issueDate: true, customer: { select: { id: true, company: true, firstName: true, lastName: true } } },
  });
  return <div className="flex flex-col gap-6">
    <BillingWorkspaceHeader active="quotations" title="Quotations" subtitle="Create, send, and follow up on customer quotations." primaryHref="/admin/quotes/new" primaryLabel="New quotation" />
    <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"><form method="get" action="/admin/billing/quotations" className="flex flex-col gap-3 sm:flex-row"><input type="hidden" name="view" value={selected === "all" ? "" : selected} /><label className="min-w-0 flex-1"><span className="sr-only">Search quotations</span><input name="q" defaultValue={query} placeholder="Search quotation number or customer" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /></label><button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Search</button></form><nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Quotation status filters">{statuses.map((status) => <Link key={status} href={href("/admin/billing/quotations", { q: query || undefined, view: status === "all" ? undefined : status })} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selected === status ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>{status === "all" ? "All" : QUOTE_STATUS_LABELS[status as QuoteStatus]}</Link>)}</nav></section>
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="overflow-x-auto"><table className="min-w-[700px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Quote</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{quotes.map((quote) => <tr key={quote.id}><td className="px-4 py-3 font-semibold"><Link href={`/admin/quotes/${quote.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">{quote.number ?? "Draft"}</Link></td><td className="px-4 py-3">{quote.customer ? customerDisplayName(quote.customer) : quote.billToName ?? "-"}</td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{quote.issueDate.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="px-4 py-3 tabular-nums">{formatMoney(Number(quote.total), quote.currency)}</td><td className="px-4 py-3"><Pill tone={quote.status === "accepted" || quote.status === "converted" ? "emerald" : quote.status === "expired" || quote.status === "declined" ? "rose" : quote.status === "sent" ? "amber" : "zinc"}>{QUOTE_STATUS_LABELS[quote.status]}</Pill></td><td className="px-4 py-3 text-right"><Link href={`/admin/quotes/${quote.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>)}{quotes.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">No matching quotations.</td></tr> : null}</tbody></table></div></section>
  </div>;
}

async function RemindersWorkspace() {
  const [deliveries, invoices] = await Promise.all([
    prisma.billingNotificationDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, eventKind: true, channel: true, status: true, attempts: true, createdAt: true, customer: { select: { id: true, company: true, firstName: true, lastName: true } }, invoice: { select: { id: true, number: true, legacyInvoiceNumber: true } } } }),
    prisma.invoice.findMany({ where: { archivedAt: null, status: { in: ["open", "partially_paid", "overdue"] }, amountDue: { gt: 0 } }, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], take: 25, select: { id: true, number: true, legacyInvoiceNumber: true, amountDue: true, currency: true, dueDate: true, status: true, customer: { select: { id: true, company: true, firstName: true, lastName: true } } } }),
  ]);
  const failed = deliveries.filter((row) => row.status === "failed").length;
  const sent = deliveries.filter((row) => row.status === "sent").length;
  return <div className="flex flex-col gap-6">
    <BillingWorkspaceHeader active="reminders" title="Payment reminders" subtitle="Review invoice reminder delivery and collection follow-up without sending automatically." />
    <div className="grid gap-3 sm:grid-cols-3"><SummaryCard label="Open invoice follow-up" value={String(invoices.length)} detail="Confirmed native receivables in this queue" tone="amber" /><SummaryCard label="Recent delivery attempts" value={String(deliveries.length)} detail="Email and WhatsApp ledger entries" /><SummaryCard label="Failed deliveries" value={String(failed)} detail={`${sent} deliveries sent in this loaded history`} tone={failed ? "rose" : "emerald"} /></div>
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Invoices needing collection review</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Opening this workspace never sends a message. Use Customer billing for an authorized, eligibility-checked retry.</p></div><div className="overflow-x-auto"><table className="min-w-[680px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Review</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{invoices.map((invoice) => <tr key={invoice.id}><td className="px-4 py-3"><Link href={`/admin/tl-invoices/${invoice.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">{displayInvoiceNumber(invoice)}</Link></td><td className="px-4 py-3">{invoice.customer ? customerDisplayName(invoice.customer) : "-"}</td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{invoice.dueDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "No due date"}</td><td className="px-4 py-3 tabular-nums">{formatMoney(Number(invoice.amountDue), invoice.currency)}</td><td className="px-4 py-3"><span className={invoiceStatusBadgeClass(invoice.status)}>{INVOICE_STATUS_LABELS[invoice.status]}</span></td><td className="px-4 py-3 text-right">{invoice.customer ? <Link href={`/admin/customers/${invoice.customer.id}/billing`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Customer billing</Link> : "-"}</td></tr>)}{invoices.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">No open native invoices need review.</td></tr> : null}</tbody></table></div></section>
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Delivery history</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Channel outcomes remain distinct, and existing retry eligibility controls are preserved.</p></div><div className="overflow-x-auto"><table className="min-w-[720px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Created</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{deliveries.map((delivery) => <tr key={delivery.id}><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{delivery.createdAt.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="px-4 py-3"><Link href={`/admin/customers/${delivery.customer.id}/billing`} className="hover:underline">{customerDisplayName(delivery.customer)}</Link></td><td className="px-4 py-3">{delivery.invoice ? <Link href={`/admin/tl-invoices/${delivery.invoice.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{displayInvoiceNumber(delivery.invoice)}</Link> : "-"}</td><td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{delivery.eventKind.replaceAll("_", " ")}</td><td className="px-4 py-3 capitalize">{delivery.channel}</td><td className="px-4 py-3"><Pill tone={normalizeProviderStatus(delivery.status)}>{delivery.status}</Pill></td><td className="px-4 py-3">{delivery.attempts}</td></tr>)}{deliveries.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">No delivery history yet.</td></tr> : null}</tbody></table></div></section>
  </div>;
}
