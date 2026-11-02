/**
 * Owner-run merge of one customer's same-term subscriptions, using exactly the same rules
 * and service as the Merge subscriptions screen. It never creates an invoice, records a
 * payment, talks to Stripe, or notifies a customer. Without --apply it only reports.
 *
 *   node --env-file=.env.local --import tsx --conditions=react-server \
 *     scripts/merge-customer-subscriptions.ts --customer "Blue Taxi" [--target <id>] [--apply]
 */
import "server-only";

import { prisma } from "../lib/db";
import { mergeCandidatesForScript } from "./merge-customer-subscriptions-support";
import { mergeSubscriptions } from "../lib/services/canonical-subscription-merge-service";
import { recordOperationalEvent } from "../lib/services/operational-event-service";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const customerQuery = arg("customer");
  if (!customerQuery) throw new Error('Pass --customer "<company name or id>".');
  const apply = process.argv.includes("--apply");

  const customers = await prisma.customer.findMany({
    where: { OR: [{ id: customerQuery }, { company: { equals: customerQuery, mode: "insensitive" } }] },
    select: { id: true, company: true },
  });
  if (customers.length !== 1) throw new Error(`Expected exactly one customer for "${customerQuery}", found ${customers.length}.`);
  const customer = customers[0];
  console.log(`Customer: ${customer.company} (${customer.id})`);

  const { candidates, groups } = await mergeCandidatesForScript(customer.id);
  for (const candidate of candidates) {
    console.log(`- ${candidate.id}  ${candidate.terms}  services=${candidate.liveServiceCount}${candidate.blockers.length ? `  BLOCKED: ${candidate.blockers.join(" | ")}` : ""}`);
  }
  if (!groups.length) {
    console.log("Nothing to merge: no two unblocked subscriptions share identical terms.");
    return;
  }
  const group = groups[0];
  const targetId = arg("target") ?? group[0].id;
  if (!group.some((candidate) => candidate.id === targetId)) throw new Error("--target is not in the mergeable group.");
  const sourceIds = group.filter((candidate) => candidate.id !== targetId).map((candidate) => candidate.id);
  console.log(`\nPlan: keep ${targetId}; merge ${sourceIds.length} into it: ${sourceIds.join(", ")}`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to merge.");
    return;
  }
  const result = await mergeSubscriptions({ targetId, sourceIds });
  await recordOperationalEvent({
    category: "subscription.subscriptions_merged",
    summary: `${result.plan.sourceIds.length} subscription${result.plan.sourceIds.length === 1 ? "" : "s"} merged into one by owner-run script before any billing.`,
    customerId: result.customerId,
    payload: { targetSubscriptionId: targetId, mergedSubscriptionIds: result.plan.sourceIds, services: result.plan.movedItemIds.length, schedulesEnded: result.plan.endedScheduleIds.length, reason: "Owner-requested merge: devices migrated one subscription each" },
  });
  console.log(`\nMerged. Moved ${result.plan.movedItemIds.length} services, ended ${result.plan.endedScheduleIds.length} schedules.`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
