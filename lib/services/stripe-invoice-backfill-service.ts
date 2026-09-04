import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { fulfillPaidStripeInvoiceReceipt } from "@/lib/services/billing-paid-receipt-fulfillment-service";
import { getCurrentCustomerSubscription } from "@/lib/services/customer-subscription-service";
import { getStripeClient, isStripeBillingEnabled } from "@/lib/stripe/config";
import {
  resolveStripeCustomerIdForTlCustomer,
  syncStripeInvoiceToDatabase,
} from "@/lib/stripe/invoice-sync";

const MAX_INVOICES_PER_CUSTOMER = 100;
const RECENT_PAID_LOOKBACK_SECONDS = 90 * 24 * 60 * 60;
const MAX_RECENT_GLOBAL = 150;

export type SyncStripeInvoicesForCustomerResult =
  | {
      ok: true;
      listed: number;
      mirrored: number;
      receipts: { pdfOk: number; emailed: number; skipped: number; failed: number };
    }
  | { ok: false; error: string };

async function listStripeInvoicesForStripeCustomer(
  stripeCustomerId: string,
): Promise<Stripe.Invoice[]> {
  const stripe = getStripeClient();
  const out: Stripe.Invoice[] = [];
  for await (const invoice of stripe.invoices.list({
    customer: stripeCustomerId,
    limit: 100,
  })) {
    out.push(invoice);
    if (out.length >= MAX_INVOICES_PER_CUSTOMER) break;
  }
  return out;
}

/**
 * Pull this customer's Stripe invoices into BillingInvoice, then generate PDFs
 * and auto-email receipts that were never sent.
 */
export async function syncStripeInvoicesForCustomer(
  customerId: string,
): Promise<SyncStripeInvoicesForCustomerResult> {
  if (!isStripeBillingEnabled()) {
    return { ok: false, error: "Stripe billing is not enabled." };
  }

  const stripeCustomerId = await resolveStripeCustomerIdForTlCustomer(customerId);
  if (!stripeCustomerId) {
    const sub = await getCurrentCustomerSubscription(customerId);
    if (!sub?.stripeSubscriptionId) {
      return { ok: false, error: "This customer has no Stripe customer id to sync from." };
    }
  }

  let invoices: Stripe.Invoice[] = [];
  try {
    if (stripeCustomerId) {
      invoices = await listStripeInvoicesForStripeCustomer(stripeCustomerId);
    }
    if (invoices.length === 0) {
      const sub = await getCurrentCustomerSubscription(customerId);
      const subId = sub?.stripeSubscriptionId?.trim();
      if (subId) {
        const stripe = getStripeClient();
        for await (const invoice of stripe.invoices.list({
          subscription: subId,
          limit: 100,
        })) {
          invoices.push(invoice);
          if (invoices.length >= MAX_INVOICES_PER_CUSTOMER) break;
        }
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not list invoices from Stripe.",
    };
  }

  if (invoices.length === 0) {
    return {
      ok: true,
      listed: 0,
      mirrored: 0,
      receipts: { pdfOk: 0, emailed: 0, skipped: 0, failed: 0 },
    };
  }

  const mirroredIds: string[] = [];
  for (const invoice of invoices) {
    const { invoiceId } = await syncStripeInvoiceToDatabase(invoice);
    if (invoiceId) mirroredIds.push(invoiceId);
  }

  const receipts = { pdfOk: 0, emailed: 0, skipped: 0, failed: 0 };
  const paidRows = await prisma.billingInvoice.findMany({
    where: {
      customerId,
      provider: "stripe",
      status: { equals: "paid", mode: "insensitive" },
      OR: [{ pdfGeneratedAt: null }, { receiptEmailedAt: null }],
    },
    select: { id: true, pdfGeneratedAt: true, receiptEmailedAt: true },
  });

  for (const row of paidRows) {
    const result = await fulfillPaidStripeInvoiceReceipt(row.id);
    if (!result.pdfOk) {
      receipts.failed += 1;
      continue;
    }
    receipts.pdfOk += 1;
    if (!result.emailOk) {
      receipts.failed += 1;
      continue;
    }
    if (result.emailSkipped) receipts.skipped += 1;
    else receipts.emailed += 1;
  }

  return {
    ok: true,
    listed: invoices.length,
    mirrored: mirroredIds.length,
    receipts,
  };
}

/**
 * Daily catch-up: mirror recently paid Stripe invoices (missed webhooks), then
 * retry TL PDF + receipt email for paid rows still pending.
 */
export async function backfillRecentPaidStripeInvoices(): Promise<{
  listed: number;
  mirrored: number;
  unresolved: number;
  errors: string[];
}> {
  if (!isStripeBillingEnabled()) {
    return { listed: 0, mirrored: 0, unresolved: 0, errors: [] };
  }

  const stripe = getStripeClient();
  const since = Math.floor(Date.now() / 1000) - RECENT_PAID_LOOKBACK_SECONDS;
  const errors: string[] = [];
  let listed = 0;
  let mirrored = 0;
  let unresolved = 0;

  try {
    for await (const invoice of stripe.invoices.list({
      status: "paid",
      created: { gte: since },
      limit: 100,
    })) {
      listed += 1;
      try {
        const { invoiceId } = await syncStripeInvoiceToDatabase(invoice);
        if (invoiceId) mirrored += 1;
        else unresolved += 1;
      } catch (e) {
        errors.push(
          `${invoice.id}: ${e instanceof Error ? e.message : "sync failed"}`,
        );
      }
      if (listed >= MAX_RECENT_GLOBAL) break;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Stripe invoice list failed.");
  }

  return { listed, mirrored, unresolved, errors };
}
