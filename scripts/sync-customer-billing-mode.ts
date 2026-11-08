/**
 * Makes each customer's Stripe flag (Customer.billingMode) follow their subscriptions:
 * Stripe when any live canonical subscription is collected by Stripe auto-charge, otherwise
 * manual. Customers without canonical subscriptions are never touched.
 *
 * It only updates that one flag. It never talks to Stripe, creates an invoice, records a
 * payment or notifies a customer. Note: a customer flipped from Stripe to manual becomes
 * eligible for automatic payment reminders (manual payers get them; Stripe payers do not).
 *
 *   node --env-file=.env.local --import tsx --conditions=react-server \
 *     scripts/sync-customer-billing-mode.ts [--customer "Plastic Solutions"] [--apply]
 *
 * Without --apply it only reports what would change.
 */
import "server-only";

import { prisma } from "../lib/db";
import { deriveCustomerBillingMode } from "../lib/domain/canonical-stripe-link";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const customerQuery = arg("customer");

  const subscriptions = await prisma.customerSubscription.findMany({
    where: {
      controlMode: "canonical",
      lifecycleStatus: { in: ["active", "paused", "pending_activation"] },
      ...(customerQuery
        ? { customer: { OR: [{ id: customerQuery }, { company: { equals: customerQuery, mode: "insensitive" } }] } }
        : {}),
    },
    select: {
      customerId: true,
      collectionMethod: true,
      customer: { select: { company: true, firstName: true, lastName: true, billingMode: true } },
    },
  });

  const byCustomer = new Map<string, { label: string; current: string; methods: (typeof subscriptions)[number]["collectionMethod"][] }>();
  for (const row of subscriptions) {
    const entry = byCustomer.get(row.customerId) ?? {
      label: row.customer.company || `${row.customer.firstName ?? ""} ${row.customer.lastName ?? ""}`.trim() || row.customerId,
      current: row.customer.billingMode,
      methods: [],
    };
    entry.methods.push(row.collectionMethod);
    byCustomer.set(row.customerId, entry);
  }

  let changes = 0;
  for (const [customerId, entry] of byCustomer) {
    const target = deriveCustomerBillingMode(entry.methods);
    if (target === entry.current) continue;
    changes += 1;
    console.log(`${apply ? "UPDATE" : "WOULD UPDATE"} ${entry.label}: ${entry.current} -> ${target} (subscriptions: ${entry.methods.map((m) => m ?? "unset").join(", ")})`);
    if (apply) await prisma.customer.update({ where: { id: customerId }, data: { billingMode: target } });
  }
  console.log(`${byCustomer.size} customer(s) checked, ${changes} ${apply ? "updated" : "would change"}.${apply ? "" : " Re-run with --apply to write."}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
