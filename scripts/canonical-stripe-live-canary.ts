/**
 * OWNER-RUN runner for the single live Stripe canary: TL Portal itself creates one customer's
 * Stripe subscription (Checkout), instead of a person doing it in the Stripe Dashboard.
 *
 * Run only in an owner-controlled terminal. It acts ONLY on the one subscription named by
 * CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID (there is deliberately no --subscription
 * argument), never prints a secret, and every step that changes anything asks you to type
 * a confirmation. The same CANONICAL_STRIPE_LIVE_CANARY_* settings (including
 * ..._MAX_RECURRING_AMOUNT) must also exist in Vercel Production, because the webhook
 * re-checks the signed authorization against them.
 *
 *   node --env-file=<owner env file> --import tsx --conditions=react-server \
 *     scripts/canonical-stripe-live-canary.ts <command> [--file .canary/authorization.json]
 *
 * Commands, in order:
 *   check      Read-only. Verifies every setting and shows the allowlisted subscription.
 *   convert    Switch the subscription to Stripe collection; pause its recurring invoices.
 *   prepare    Read-only. Show the exact proposal you will be asked to sign.
 *   sign       Answer the owner confirmations; writes a signed authorization (valid <24h).
 *   approve    Record the durable approval for the signed authorization.
 *   execute    Create the one Stripe Checkout and print the link for the customer.
 *   status     Read-only. Operation, provider link and invoices.
 *   finalize   After the customer paid and Stripe is linked: end the paused invoice schedules.
 *   revert     Checkout never completed: return to recurring invoices (only before Stripe exists).
 *   sign --cancel <sub_id>, then cancel <sub_id>: schedule cancellation at period end.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";

import { prisma } from "../lib/db";
import {
  assertCanonicalStripeLiveCanaryAuthorization,
  assertCanonicalStripeLiveCanaryEnvironment,
  canonicalStripeLiveCanaryProposalDigest,
  liveCanaryMaxRecurringAmount,
  LIVE_CANARY_AUTHORIZATION_MAX_AGE_MS,
  LIVE_CANARY_PROVIDER_CONTEXT,
  signCanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryEnvironment,
} from "../lib/domain/canonical-stripe-live-canary";
import { getCanonicalStripeLiveCanaryUnsignedProposal } from "../lib/services/canonical-stripe-execution-service";
import {
  approveCanonicalStripeLiveCanary,
  executeCanonicalStripeLiveCanary,
  getCanonicalStripeLiveCanaryCompletedProposal,
  getCanonicalStripeLiveCanaryProposal,
  getCanonicalStripeLiveCanaryStatus,
  scheduleCanonicalStripeLiveCanaryCancellation,
} from "../lib/services/canonical-stripe-live-canary-service";
import {
  convertSubscriptionToStripeCollectionForCanary,
  finalizeCanaryCollection,
  revertCanaryCollectionToRecurringInvoices,
} from "../lib/services/canonical-stripe-canary-collection-service";

// The owner runs this from their own terminal against production; the canary's own gates
// require the production context, so state it explicitly rather than mutating process.env.
const environment = { ...process.env, NODE_ENV: "production", VERCEL_ENV: "production" } as CanonicalStripeLiveCanaryEnvironment;
const DEFAULT_FILE = ".canary/authorization.json";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requireValue(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} must be set.`);
  return trimmed;
}

const subscriptionId = () => requireValue(environment.CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID, "CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID");
const customerId = () => requireValue(environment.CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID, "CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID");
const ownerEmail = () => requireValue(environment.CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL, "CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL");
const accountId = () => requireValue(environment.CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID, "CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID");

async function confirm(prompt: string, expected = "yes"): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${prompt}\nType ${expected} to continue: `)).trim();
    if (answer !== expected) throw new Error("Not confirmed. Nothing was changed.");
  } finally {
    rl.close();
  }
}

function readAuthorization(): CanonicalStripeLiveCanaryAuthorization {
  const file = arg("file") ?? DEFAULT_FILE;
  return JSON.parse(readFileSync(file, "utf8")) as CanonicalStripeLiveCanaryAuthorization;
}

async function assertAllowlistedSubscription(): Promise<{ id: string; customerId: string }> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId() },
    select: { id: true, customerId: true },
  });
  if (!subscription) throw new Error("The allowlisted subscription does not exist.");
  if (subscription.customerId !== customerId()) {
    throw new Error("The allowlisted subscription does not belong to the allowlisted customer.");
  }
  return subscription;
}

function describeProposal(proposal: Awaited<ReturnType<typeof getCanonicalStripeLiveCanaryUnsignedProposal>>): string {
  return [
    `  customer        ${proposal.customerId}`,
    `  subscription    ${proposal.subscriptionId}`,
    `  charge          ${proposal.currency} ${proposal.expectedRecurringTotal} every ${proposal.billingIntervalMonths} month(s)`,
    `  renews on       ${proposal.nextBillingDate.toISOString().slice(0, 10)} (billing anchor preserved, no proration)`,
    `  rate groups     ${proposal.rateGroups.map((group) => `${group.quantity} x ${group.agreedAmountPerCycle}`).join(" + ")}`,
    `  operation key   ${proposal.operationKey}`,
    `  cap in force    EC$${liveCanaryMaxRecurringAmount(environment)}`,
  ].join("\n");
}

async function check() {
  assertCanonicalStripeLiveCanaryEnvironment(environment);
  const subscription = await assertAllowlistedSubscription();
  const status = await getCanonicalStripeLiveCanaryStatus(subscription.id);
  console.log("Canary settings: OK (production context, flag, allowlists, account, owner, secret, live key, webhook secret).");
  console.log(`Cap in force: EC$${liveCanaryMaxRecurringAmount(environment)}`);
  console.log(`Allowlisted subscription ${status.id}: ${status.lifecycleStatus}, ${status.collectionMethod}, ${status.controlMode}, next ${status.nextBillingDate?.toISOString().slice(0, 10)}`);
  console.log(`Canary operations: ${status.billingOperations.length}; open Stripe links: ${status.providerLinks.length}`);
}

async function convert() {
  const subscription = await assertAllowlistedSubscription();
  await confirm(
    "This switches the subscription to Stripe collection and PAUSES its recurring invoices. If the customer never completes Checkout you must run 'revert', or nobody bills them.",
    "CONVERT",
  );
  const result = await convertSubscriptionToStripeCollectionForCanary(subscription.id);
  console.log(`Converted. Paused ${result.pausedScheduleIds.length} recurring invoice schedule(s).`);
}

async function prepare() {
  assertCanonicalStripeLiveCanaryEnvironment(environment);
  const subscription = await assertAllowlistedSubscription();
  const proposal = await getCanonicalStripeLiveCanaryUnsignedProposal(subscription.id);
  console.log("Proposal to review (nothing has been sent to Stripe):\n" + describeProposal(proposal));
}

async function sign() {
  assertCanonicalStripeLiveCanaryEnvironment(environment);
  const subscription = await assertAllowlistedSubscription();
  const cancelTarget = arg("cancel");
  const operation = cancelTarget ? "cancel_subscription_at_period_end" as const : "activate_subscription" as const;
  const proposal = cancelTarget
    ? await getCanonicalStripeLiveCanaryCompletedProposal({ subscriptionId: subscription.id, externalSubscriptionId: cancelTarget })
    : await getCanonicalStripeLiveCanaryUnsignedProposal(subscription.id);

  console.log(`${cancelTarget ? `CANCEL ${cancelTarget} AT PERIOD END` : "ACTIVATE"} proposal:\n${describeProposal(proposal)}\n`);
  const questions = [
    "Is this the right customer, and have they agreed to be charged by card through Stripe?",
    "Is this the right subscription with the right services?",
    `Do you approve a real charge of ${proposal.currency} ${proposal.expectedRecurringTotal} (tax 0.00) each cycle?`,
    `Have you confirmed in the Stripe Dashboard that XCD card payments work and ${proposal.currency} ${proposal.expectedRecurringTotal} is above the account's minimum charge?`,
    `Is the renewal date ${proposal.nextBillingDate.toISOString().slice(0, 10)} correct?`,
    "Do you know how to cancel (cancel at period end, then verify in Stripe)?",
  ];
  for (const question of questions) await confirm(question);

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + Math.min(LIVE_CANARY_AUTHORIZATION_MAX_AGE_MS - 60_000, 23 * 60 * 60 * 1000));
  const unsigned: Omit<CanonicalStripeLiveCanaryAuthorization, "signature"> = {
    authorizationId: randomUUID(),
    operation,
    operationKey: proposal.operationKey,
    requestFingerprint: proposal.requestFingerprint,
    sourceFingerprint: proposal.sourceFingerprint,
    proposalDigest: canonicalStripeLiveCanaryProposalDigest(proposal),
    providerContext: LIVE_CANARY_PROVIDER_CONTEXT,
    providerAccountId: accountId(),
    externalSubscriptionId: cancelTarget,
    approvedByEmail: ownerEmail(),
    customerId: proposal.customerId,
    subscriptionId: proposal.subscriptionId,
    currency: proposal.currency,
    recurringAmount: proposal.expectedRecurringTotal,
    taxAmount: "0.00",
    totalExpectedCharge: proposal.expectedRecurringTotal,
    billingIntervalMonths: proposal.billingIntervalMonths,
    renewalDate: proposal.nextBillingDate.toISOString().slice(0, 10),
    cancellationProcedure: "cancel_at_period_end_and_verify",
    customerIdentityConfirmed: true,
    subscriptionConfirmed: true,
    chargeConfirmed: true,
    minimumChargeConfirmed: true,
    renewalConfirmed: true,
    cancellationConfirmed: true,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const authorization: CanonicalStripeLiveCanaryAuthorization = {
    ...unsigned,
    signature: signCanonicalStripeLiveCanaryAuthorization(unsigned, environment),
  };
  // Independently verify before anything is written.
  assertCanonicalStripeLiveCanaryAuthorization({
    proposal,
    authorization,
    expectedOperation: operation,
    externalSubscriptionId: cancelTarget,
    environment,
  });
  const file = arg("file") ?? DEFAULT_FILE;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(authorization, null, 2), { mode: 0o600 });
  console.log(`Signed authorization written to ${file}. It expires ${expiresAt.toISOString()}. It contains no secret, but keep it private.`);
}

async function approve() {
  const authorization = readAuthorization();
  const proposal = await getCanonicalStripeLiveCanaryProposal({ authorization, environment });
  console.log("Recording durable approval for:\n" + describeProposal(proposal));
  await confirm("This records the approval. It does not call Stripe.", "APPROVE");
  const result = await approveCanonicalStripeLiveCanary({
    authorization,
    confirmationToken: proposal.confirmationToken,
    approvedBy: ownerEmail(),
    approvalReason: "Owner-approved single-customer live canary: TL Portal creates the customer's Stripe subscription.",
    environment,
  });
  console.log(`Approved. Operation ${result.operationId}${result.reused ? " (already existed)" : ""}.`);
}

async function execute() {
  const authorization = readAuthorization();
  const operation = await prisma.billingOperation.findUnique({ where: { operationKey: authorization.operationKey }, select: { id: true } });
  if (!operation) throw new Error("No approved operation exists for this authorization. Run 'approve' first.");
  await confirm(
    "This creates the one live Stripe Checkout Session (Stripe is contacted). No charge happens until the customer completes it.",
    "EXECUTE",
  );
  const result = await executeCanonicalStripeLiveCanary({ operationId: operation.id, authorization, environment });
  console.log(`Status: ${result.status}`);
  console.log(`Checkout: ${result.providerReference ?? "(none)"}`);
  if (result.message) console.log(result.message);
  console.log("Run 'status' to see the Checkout link state. Send the link to the customer.");
}

async function status() {
  const subscription = await assertAllowlistedSubscription();
  console.log(JSON.stringify(await getCanonicalStripeLiveCanaryStatus(subscription.id), null, 2));
}

async function finalize() {
  const subscription = await assertAllowlistedSubscription();
  await confirm("Only run this once the customer paid and Stripe shows as linked in 'status'. It ends the paused invoice schedules.", "FINALIZE");
  const result = await finalizeCanaryCollection(subscription.id);
  console.log(`Finalized. Ended ${result.endedScheduleCount} schedule(s); customer Stripe flag ${result.billingModeChanged ? "updated" : "already correct"}.`);
}

async function revert() {
  const subscription = await assertAllowlistedSubscription();
  await confirm("Checkout never completed and no Stripe subscription exists. This returns the subscription to recurring invoices.", "REVERT");
  const result = await revertCanaryCollectionToRecurringInvoices(subscription.id);
  console.log(`Reverted. Resumed ${result.resumedScheduleIds.length} recurring invoice schedule(s).`);
}

async function cancel() {
  const target = process.argv[3];
  if (!target?.startsWith("sub_")) throw new Error("Usage: cancel <stripe subscription id>. Run 'sign --cancel <id>' first.");
  const authorization = readAuthorization();
  const phrase = `CANCEL ${target} AT PERIOD END`;
  console.log(`Type the exact phrase to schedule cancellation at the end of the paid period.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`${phrase}\n> `)).trim();
  rl.close();
  const result = await scheduleCanonicalStripeLiveCanaryCancellation({
    authorization,
    externalSubscriptionId: target,
    confirmationPhrase: typed,
    environment,
  });
  console.log("Cancellation scheduled at period end:", JSON.stringify(result, null, 2));
}

const commands: Record<string, () => Promise<void>> = { check, convert, prepare, sign, approve, execute, status, finalize, revert, cancel };

async function main() {
  const name = process.argv[2];
  const run = name ? commands[name] : undefined;
  if (!run) throw new Error(`Usage: <${Object.keys(commands).join("|")}>`);
  await run();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
