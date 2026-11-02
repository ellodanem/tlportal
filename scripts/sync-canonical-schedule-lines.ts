/**
 * Brings the line items stored on canonical recurring schedules back in line with the services
 * on their subscription (one line per billable service), e.g. after a subscription merge.
 * It only rewrites those stored display lines; it never changes dates or status, and never
 * creates an invoice, records a payment, talks to Stripe or notifies a customer.
 *
 *   node --env-file=.env.local --import tsx --conditions=react-server \
 *     scripts/sync-canonical-schedule-lines.ts [--customer "Blue Taxi"] [--apply]
 *
 * Without --apply it only reports what would change.
 */
import "server-only";

import { prisma } from "../lib/db";
import { syncCanonicalScheduleLines } from "../lib/services/canonical-schedule-line-sync-service";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const customerQuery = arg("customer");
  let customerId: string | undefined;
  if (customerQuery) {
    const customers = await prisma.customer.findMany({
      where: { OR: [{ id: customerQuery }, { company: { equals: customerQuery, mode: "insensitive" } }] },
      select: { id: true, company: true },
    });
    if (customers.length !== 1) throw new Error(`Expected exactly one customer for "${customerQuery}", found ${customers.length}.`);
    customerId = customers[0].id;
    console.log(`Customer: ${customers[0].company} (${customerId})`);
  }

  const subscriptions = await prisma.customerSubscription.findMany({
    where: {
      controlMode: "canonical",
      lifecycleStatus: { notIn: ["ended", "canceled"] },
      ...(customerId ? { customerId } : {}),
    },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  let changed = 0;
  for (const subscription of subscriptions) {
    // Dry run: do the work inside a transaction and roll it back.
    const result = await prisma.$transaction(async (tx) => {
      const synced = await syncCanonicalScheduleLines(tx, subscription.id);
      if (!apply && synced?.changed) throw Object.assign(new Error("dry-run"), { synced });
      return synced;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "dry-run") return (error as unknown as { synced: Awaited<ReturnType<typeof syncCanonicalScheduleLines>> }).synced;
      throw error;
    });
    if (!result?.changed) continue;
    changed += 1;
    const total = result.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0).toFixed(2);
    console.log(`${apply ? "Updated" : "Would update"} schedule ${result.scheduleId} (subscription ${subscription.id}): ${result.lines.length} line(s), cycle total ${total}`);
  }
  console.log(`\n${changed} schedule(s) ${apply ? "updated" : "would change"} of ${subscriptions.length} checked.${apply ? "" : " Dry run only; re-run with --apply."}`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
