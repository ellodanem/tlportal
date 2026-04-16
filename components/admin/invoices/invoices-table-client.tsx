"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";

import { InvoiceDeleteForm } from "@/components/admin/invoices/invoice-delete-form";
import { IconSearch } from "@/components/dashboard/dashboard-icons";
import type { InvoilessInvoiceListRow } from "@/lib/invoiless/invoices-list";

export type TlCustomerLink = { portalId: string; name: string };

const PAGE_LIMITS = [25, 50, 100] as const;

type Props = {
  rows: InvoilessInvoiceListRow[];
  tlCustomerByInvoilessId: Record<string, TlCustomerLink>;
  /** Lowercase email → linked TL customer (bill-to match when Invoiless customer id differs) */
  tlCustomerByEmail?: Record<string, TlCustomerLink>;
  page: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  search: string;
  invoilessConfigured: boolean;
  invoilessDashboardUrl: string;
  /** When set, list was loaded by pulling from Invoiless for this linked TL customer only. */
  scopedToCustomer?: { portalId: string; name: string } | null;
};

function invoicesHref(opts: { page?: number; search?: string; limit?: number; customer?: string }) {
  const params = new URLSearchParams();
  if (opts.customer?.trim()) params.set("customer", opts.customer.trim());
  if (opts.page != null && opts.page > 1) params.set("page", String(opts.page));
  if (opts.search != null && opts.search.trim()) params.set("q", opts.search.trim());
  if (opts.limit != null && opts.limit !== 50) params.set("limit", String(opts.limit));
  const s = params.toString();
  return s ? `/admin/invoices?${s}` : "/admin/invoices";
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const code = currency?.trim() || "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function formatDateShort(iso: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function invoiceStatusClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize";
  if (s === "paid") return `${base} bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200`;
  if (s === "draft") return `${base} bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100`;
  if (s === "pending" || s === "unpaid" || s === "partial")
    return `${base} bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200`;
  if (s === "canceled" || s === "cancelled")
    return `${base} bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400`;
  if (s === "refunded") return `${base} bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200`;
  return `${base} bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200`;
}

function statusBucket(status: string | null): "paid" | "outstanding" | "draft" | "other" {
  const s = (status ?? "").toLowerCase();
  if (s === "paid") return "paid";
  if (s === "draft") return "draft";
  if (s === "pending" || s === "unpaid" || s === "partial") return "outstanding";
  return "other";
}

function IconLayersStack(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2 3 7l9 5 9-5-9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClock(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconPenLine(props: { className?: string }) {
  return (
    <svg className={props.className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOutLink(props: { className?: string }) {
  return (
    <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21-9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShare(props: { className?: string }) {
  return (
    <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Shown in mail body when we have no client email from Invoiless (inbox not wired yet). */
const MAILTO_PLACEHOLDER_NOTE =
  "(Add the client's email in the To field — TL Portal inbox is not connected yet, so you send from your own mail app.)";

function buildInvoiceMailtoHref(previewUrl: string, invoiceLabel: string, clientEmail: string | null | undefined): string {
  const subject = encodeURIComponent(`Invoice ${invoiceLabel}`);
  const to = clientEmail?.trim();
  const bodyLines = to
    ? ["Hi,", "", "Your invoice is ready to view:", previewUrl, "", "Thank you."]
    : ["Hi,", "", MAILTO_PLACEHOLDER_NOTE, "", "Invoice link:", previewUrl, ""];
  const body = encodeURIComponent(bodyLines.join("\n"));
  if (to) {
    return `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
  }
  return `mailto:?subject=${subject}&body=${body}`;
}

type StatMiniProps = {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  tone: "slate" | "emerald" | "amber" | "violet";
};

const toneRing: Record<StatMiniProps["tone"], string> = {
  slate: "ring-sky-500/15 bg-gradient-to-br from-sky-50/90 to-white dark:from-sky-950/40 dark:to-zinc-900",
  emerald: "ring-emerald-500/20 bg-gradient-to-br from-emerald-50/90 to-white dark:from-emerald-950/35 dark:to-zinc-900",
  amber: "ring-amber-500/20 bg-gradient-to-br from-amber-50/90 to-white dark:from-amber-950/30 dark:to-zinc-900",
  violet: "ring-violet-500/15 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/25 dark:to-zinc-900",
};

const toneIcon: Record<StatMiniProps["tone"], string> = {
  slate: "text-sky-700 bg-sky-100/80 dark:text-sky-200 dark:bg-sky-950/50",
  emerald: "text-emerald-800 bg-emerald-100/80 dark:text-emerald-200 dark:bg-emerald-950/50",
  amber: "text-amber-800 bg-amber-100/80 dark:text-amber-200 dark:bg-amber-950/50",
  violet: "text-violet-800 bg-violet-100/80 dark:text-violet-200 dark:bg-violet-950/50",
};

function StatMini({ label, value, hint, icon, tone }: StatMiniProps) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ring-1 ring-inset ${toneRing[tone]} dark:ring-zinc-700/80`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {value}
          </p>
          <p className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{hint}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneIcon[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

export function InvoicesTableClient({
  rows,
  tlCustomerByInvoilessId,
  tlCustomerByEmail = {},
  page,
  totalPages,
  totalItems,
  limit,
  search,
  invoilessConfigured,
  invoilessDashboardUrl,
  scopedToCustomer = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(search);
  const deferredQ = useDeferredValue(query);
  const [openShareMenuId, setOpenShareMenuId] = useState<string | null>(null);
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (openShareMenuId == null) return;
    const onDocMouseDown = () => setOpenShareMenuId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenShareMenuId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openShareMenuId]);

  async function copyInvoiceLink(invoiceId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopyFeedbackId(invoiceId);
      copyTimerRef.current = setTimeout(() => setCopyFeedbackId(null), 2200);
    } catch {
      window.prompt("Copy invoice link:", url);
    }
  }

  const limitSelectValue = PAGE_LIMITS.includes(limit as (typeof PAGE_LIMITS)[number]) ? limit : 50;

  const filtered = useMemo(() => {
    const q = deferredQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const num = (r.number ?? "").toLowerCase();
      const st = (r.status ?? "").toLowerCase();
      const cl = (r.customerLabel ?? "").toLowerCase();
      const be = (r.billToEmail ?? "").toLowerCase();
      const bp = (r.billToPhone ?? "").replace(/\D/g, "");
      const qDigits = q.replace(/\D/g, "");
      const id = r.id.toLowerCase();
      const tlName =
        r.customerInvoilessId && tlCustomerByInvoilessId[r.customerInvoilessId]
          ? tlCustomerByInvoilessId[r.customerInvoilessId]!.name.toLowerCase()
          : "";
      const tlByEm =
        r.billToEmail && tlCustomerByEmail[r.billToEmail.trim().toLowerCase()]
          ? tlCustomerByEmail[r.billToEmail.trim().toLowerCase()]!.name.toLowerCase()
          : "";
      const phoneMatch = qDigits.length >= 4 && bp.length > 0 && bp.includes(qDigits);
      return (
        num.includes(q) ||
        st.includes(q) ||
        cl.includes(q) ||
        be.includes(q) ||
        (r.billToPhone ?? "").toLowerCase().includes(q) ||
        phoneMatch ||
        id.includes(q) ||
        tlName.includes(q) ||
        tlByEm.includes(q)
      );
    });
  }, [rows, deferredQ, tlCustomerByInvoilessId, tlCustomerByEmail]);

  const pageStats = useMemo(() => {
    let paid = 0;
    let outstanding = 0;
    let draft = 0;
    let other = 0;
    let sum = 0;
    let sumCurrency: string | null = null;
    for (const r of rows) {
      const b = statusBucket(r.status);
      if (b === "paid") paid += 1;
      else if (b === "outstanding") outstanding += 1;
      else if (b === "draft") draft += 1;
      else other += 1;
      if (r.total != null && Number.isFinite(r.total)) {
        sum += r.total;
        sumCurrency = sumCurrency ?? r.currency;
      }
    }
    return { paid, outstanding, draft, other, sum, sumCurrency };
  }, [rows]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (scopedToCustomer) return;
    startTransition(() => {
      router.push(invoicesHref({ page: 1, search: query, limit }));
    });
  }

  if (!invoilessConfigured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Invoiless is not configured</p>
        <p className="mt-2 text-amber-900/90 dark:text-amber-200/90">
          Set <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">INVOILESS_API_KEY</code> in the
          environment to load invoices from Invoiless (same key as customer sync).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatMini
          label={scopedToCustomer ? "Pulled for customer" : "In Invoiless"}
          value={totalItems.toLocaleString()}
          hint={
            scopedToCustomer
              ? `Invoices in Invoiless that match this customer's linked id (up to 100 on load).`
              : "Invoices in your workspace (all pages)."
          }
          icon={<IconLayersStack className="h-5 w-5" />}
          tone="slate"
        />
        <StatMini
          label="Paid · this page"
          value={pageStats.paid}
          hint={`Of ${rows.length} loaded on page ${page}.`}
          icon={<IconCheck className="h-5 w-5" />}
          tone="emerald"
        />
        <StatMini
          label="Outstanding · this page"
          value={pageStats.outstanding}
          hint="Pending, unpaid, or partial."
          icon={<IconClock className="h-5 w-5" />}
          tone="amber"
        />
        <StatMini
          label="Draft & other · this page"
          value={pageStats.draft + pageStats.other}
          hint={`Draft ${pageStats.draft} · other ${pageStats.other}`}
          icon={<IconPenLine className="h-5 w-5" />}
          tone="violet"
        />
      </section>

      {scopedToCustomer ? (
        <div className="rounded-xl border border-sky-200/90 bg-sky-50/80 p-4 text-sm text-sky-950 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-100">
          <p className="font-medium text-sky-900 dark:text-sky-50">Pulled for one linked customer</p>
          <p className="mt-1 text-sky-900/85 dark:text-sky-100/85">
            These rows came from Invoiless using{" "}
            <Link
              href={`/admin/customers/${scopedToCustomer.portalId}`}
              className="font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
            >
              {scopedToCustomer.name}
            </Link>
            {"'s linked Invoiless customer id. You do not link invoices one by one in TL Portal."}
          </p>
          <p className="mt-2">
            <Link
              href="/admin/invoices"
              className="text-sm font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
            >
              Clear filter — full workspace list
            </Link>
          </p>
        </div>
      ) : null}

      {rows.length > 0 && pageStats.sum > 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Page subtotal</span>{" "}
          {formatMoney(pageStats.sum, pageStats.sumCurrency)}
          <span className="text-zinc-400"> · </span>
          sums line totals on this page only; mixed currencies use the first code seen.
        </p>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <form onSubmit={submitSearch} className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-lg">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
              <IconSearch className="h-4 w-4" />
            </span>
            <label htmlFor="invoice-search" className="sr-only">
              Search invoices
            </label>
            <input
              id="invoice-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Number, client, status…"
              autoComplete="off"
              className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scopedToCustomer ? (
              <Link
                href={query.trim() ? `/admin/invoices?q=${encodeURIComponent(query.trim())}` : "/admin/invoices"}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Search workspace
              </Link>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {pending ? "Searching…" : "Run search"}
              </button>
            )}
            {!scopedToCustomer && search.trim() ? (
              <Link
                href={invoicesHref({ page: 1, limit })}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Clear API filter
              </Link>
            ) : null}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          {!scopedToCustomer ? (
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="whitespace-nowrap">Rows</span>
              <select
                value={limitSelectValue}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  startTransition(() => {
                    router.push(invoicesHref({ page: 1, search, limit: next }));
                  });
                }}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {PAGE_LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <Link
              href="/admin/invoices/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              <span className="text-lg leading-none">+</span>
              New invoice
            </Link>
            <a
              href={invoilessDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-300 sm:text-right"
            >
              Open in Invoiless app
            </a>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {scopedToCustomer ? (
          <>
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Tip:</span> The search field filters this
            table in your browser only. Use <span className="font-medium">Search workspace</span> to query all invoices
            via Invoiless.
          </>
        ) : (
          <>
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Tip:</span> Run search sends your text to
            Invoiless (number, client name, tags). The field above also filters loaded rows in your browser.
            {search.trim() ? (
              <>
                {" "}
                Active API filter: <span className="font-mono text-zinc-700 dark:text-zinc-300">“{search.trim()}”</span>
              </>
            ) : null}
          </>
        )}
      </p>

      <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Invoice list</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {rows.length} row{rows.length === 1 ? "" : "s"} on this page
              {totalItems > 0 ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{totalItems.toLocaleString()}</span> total at Invoiless
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    No invoices match this view.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const em = r.billToEmail?.trim().toLowerCase();
                  const tl = scopedToCustomer
                    ? { portalId: scopedToCustomer.portalId, name: scopedToCustomer.name }
                    : r.customerInvoilessId != null
                      ? tlCustomerByInvoilessId[r.customerInvoilessId]
                      : em
                        ? tlCustomerByEmail[em]
                        : undefined;
                  const displayNum = r.number?.trim() || r.id;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-zinc-50 transition last:border-b-0 hover:bg-zinc-50/70 dark:border-zinc-800/80 dark:hover:bg-zinc-950/50"
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">#</span>
                            <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {displayNum}
                            </span>
                          </span>
                          {r.isRetainer ? (
                            <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900 dark:bg-sky-950/60 dark:text-sky-200">
                              Retainer
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[14rem] px-4 py-3.5 align-middle text-zinc-800 dark:text-zinc-200">
                        {tl ? (
                          <Link
                            href={`/admin/customers/${tl.portalId}`}
                            className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                          >
                            {tl.name}
                          </Link>
                        ) : (
                          <span className="line-clamp-2">
                            {r.customerLabel ?? (r.customerInvoilessId ? "Invoiless customer" : "—")}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-middle tabular-nums text-zinc-600 dark:text-zinc-300">
                        {formatDateShort(r.dateIssued)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-middle tabular-nums text-zinc-600 dark:text-zinc-300">
                        {formatDateShort(r.dueDate)}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span className={invoiceStatusClass(r.status)}>{r.status ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-right text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {formatMoney(r.total, r.currency)}
                      </td>
                      <td className="px-4 py-3.5 align-middle text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {invoilessConfigured ? (
                            <Link
                              href={`/admin/invoices/${encodeURIComponent(r.id)}/edit`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              title={`Edit invoice ${displayNum}`}
                            >
                              Edit
                              <IconPenLine className="h-3.5 w-3.5 opacity-70" />
                            </Link>
                          ) : null}
                          {r.previewUrl ? (
                            <>
                              <a
                                href={r.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                title={r.id}
                              >
                                View
                                <IconOutLink className="opacity-70" />
                              </a>
                              <div className="relative">
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenShareMenuId((x) => (x === r.id ? null : r.id));
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                  title="Email or copy invoice link"
                                  aria-label={`Share invoice ${displayNum}`}
                                  aria-expanded={openShareMenuId === r.id}
                                  aria-haspopup="true"
                                >
                                  {copyFeedbackId === r.id ? "Copied" : "Share"}
                                  <IconShare className="opacity-80" />
                                </button>
                                {openShareMenuId === r.id ? (
                                  <div
                                    role="menu"
                                    className="absolute right-0 top-full z-50 mt-1 min-w-[13.5rem] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    <a
                                      role="menuitem"
                                      href={buildInvoiceMailtoHref(r.previewUrl, displayNum, r.billToEmail)}
                                      className="block px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                      onClick={() => setOpenShareMenuId(null)}
                                    >
                                      <span className="font-medium">Email invoice…</span>
                                      <span className="mt-0.5 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                        {r.billToEmail?.trim()
                                          ? `Opens mail to ${r.billToEmail.trim()}`
                                          : "Opens mail — add To: (inbox in TL not wired yet)"}
                                      </span>
                                    </a>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                      onClick={() => {
                                        void copyInvoiceLink(r.id, r.previewUrl!);
                                        setOpenShareMenuId(null);
                                      }}
                                    >
                                      <span className="font-medium">Copy link</span>
                                      <span className="mt-0.5 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                        Public invoice URL
                                      </span>
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                              <InvoiceDeleteForm invoiceId={r.id} displayNum={displayNum} />
                            </>
                          ) : invoilessConfigured ? (
                            <InvoiceDeleteForm invoiceId={r.id} displayNum={displayNum} />
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 text-sm dark:border-zinc-800">
            <p className="text-zinc-600 dark:text-zinc-400">
              Page <span className="font-semibold text-zinc-900 dark:text-zinc-100">{page}</span> of{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={invoicesHref({
                    page: page - 1,
                    search,
                    limit,
                    customer: scopedToCustomer?.portalId,
                  })}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Previous
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  href={invoicesHref({
                    page: page + 1,
                    search,
                    limit,
                    customer: scopedToCustomer?.portalId,
                  })}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
