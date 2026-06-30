import Link from "next/link";
import { redirect } from "next/navigation";

import { InvoicesTableClient } from "@/components/admin/invoices/invoices-table-client";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { loadInvoilessCustomerLinks, resolveInvoilessIdForCustomer } from "@/lib/admin/invoiless-customer-links";
import { prisma } from "@/lib/db";
import { isInvoilessLegacyUiEnabled, isNativeBillingPrimary } from "@/lib/domain/native-billing-cutover";
import {
  fetchInvoicesForInvoilessCustomerId,
  fetchInvoicesPage,
  isInvoilessConfigured,
} from "@/lib/invoiless/invoices-list";

type Props = {
  searchParams: Promise<{ page?: string; q?: string; limit?: string; customer?: string; legacy?: string }>;
};

/** Invoiless web app — create invoice (login required). */
const INVOILESS_NEW_INVOICE_URL = "https://app.invoiless.com/invoices/create";

const ALLOWED_LIMITS = [25, 50, 100] as const;

function normalizeLimit(raw: string | undefined): number {
  const n = parseInt(raw ?? "50", 10) || 50;
  return (ALLOWED_LIMITS as readonly number[]).includes(n) ? n : 50;
}

export default async function AdminInvoicesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const legacy = sp.legacy === "1" || sp.legacy === "true";

  if (isNativeBillingPrimary() && !legacy && !isInvoilessLegacyUiEnabled()) {
    redirect("/admin/tl-invoices");
  }

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const limit = normalizeLimit(sp.limit);
  const q = (sp.q ?? "").trim();
  const customerIdFilter = (sp.customer ?? "").trim();

  const invoilessConfigured = isInvoilessConfigured();

  const { tlCustomerByInvoilessId, tlCustomerByEmail } = invoilessConfigured
    ? await loadInvoilessCustomerLinks()
    : { tlCustomerByInvoilessId: {}, tlCustomerByEmail: {} };

  let rows: Awaited<ReturnType<typeof fetchInvoicesPage>>["rows"] = [];
  let pagination = { page, limit, totalPages: 1, totalItems: 0 };
  let loadError: string | null = null;
  let customerScopeMessage: string | null = null;
  let scopedToCustomer: { portalId: string; name: string } | null = null;

  if (invoilessConfigured && customerIdFilter) {
    const cust = await prisma.customer.findUnique({
      where: { id: customerIdFilter },
      select: {
        id: true,
        company: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        invoilessCustomerId: true,
      },
    });
    if (!cust) {
      customerScopeMessage =
        "Customer not found. Remove the customer filter from the URL or open Invoices from a customer in TL Portal.";
    } else {
      const invoilessCustomerId = await resolveInvoilessIdForCustomer(cust.id);
      if (!invoilessCustomerId) {
        customerScopeMessage =
          "This customer is not linked to Invoiless yet. Open Billing and link accounts (or sync on edit), then return here.";
      } else {
      scopedToCustomer = { portalId: cust.id, name: customerDisplayName(cust) };
      try {
        const hints = [customerDisplayName(cust), cust.email?.trim()].filter(Boolean) as string[];
        rows = await fetchInvoicesForInvoilessCustomerId(invoilessCustomerId, {
          maxInvoices: 100,
          searchHints: hints,
          matchEmails: cust.email?.trim() ? [cust.email.trim()] : [],
          matchPhones: cust.phone?.trim() ? [cust.phone.trim()] : [],
          maxPagesPerSearchTerm: 6,
          fallbackScanMaxPages: 8,
        });
        pagination = { page: 1, limit, totalPages: 1, totalItems: rows.length };
      } catch (e) {
        loadError = e instanceof Error ? e.message : "Failed to load invoices from Invoiless.";
      }
      }
    }
  } else if (invoilessConfigured) {
    try {
      const result = await fetchInvoicesPage({ page, limit, search: q || undefined });
      rows = result.rows;
      pagination = result.pagination;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Failed to load invoices from Invoiless.";
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Invoices</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Invoices</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">Accounting (Invoiless)</strong> — legacy
          one-offs. For new invoices use{" "}
          <Link href="/admin/tl-invoices" className="font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
            TL invoices
          </Link>
          . Card subscriptions run through <strong className="font-medium">Customer → Billing</strong> (Stripe).
        </p>
      </div>

      {customerScopeMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Customer filter</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">{customerScopeMessage}</p>
        </div>
      ) : null}

      {!invoilessConfigured || loadError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">
            {loadError ? "Invoiless is not responding" : "Invoiless is not configured"}
          </p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            {loadError ? (
              <span className="font-mono text-xs opacity-90">{loadError}</span>
            ) : (
              "Set INVOILESS_API_KEY to list and create invoices here."
            )}{" "}
            Need to send a quote now? Use{" "}
            <Link href="/admin/quotes" className="font-semibold underline underline-offset-2">
              Quick quote
            </Link>{" "}
            to download a branded PDF without Invoiless.
          </p>
        </div>
      ) : null}

      <InvoicesTableClient
        rows={rows}
        tlCustomerByInvoilessId={tlCustomerByInvoilessId}
        tlCustomerByEmail={tlCustomerByEmail}
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        limit={pagination.limit}
        search={scopedToCustomer ? "" : q}
        invoilessConfigured={invoilessConfigured}
        invoilessDashboardUrl={INVOILESS_NEW_INVOICE_URL}
        scopedToCustomer={scopedToCustomer}
      />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/admin" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
