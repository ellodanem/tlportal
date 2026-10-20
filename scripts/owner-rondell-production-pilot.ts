/**
 * One-time OWNER-RUN production procedure for the approved Rondell pilot.
 *
 * Never commit a generated secret, DATABASE_URL, or command output containing
 * credentials. Run only in an owner-controlled terminal that already has the
 * direct production DATABASE_URL and authenticated Vercel CLI access.
 */
import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";

import { prisma } from "../lib/db";
import {
  signCanonicalManualPilotAuthorization,
  signCanonicalManualPilotMigrationAuthorization,
  type CanonicalManualPilotEnvironment,
  type CanonicalManualPilotAuthorization,
  type CanonicalManualPilotMigrationAuthorization,
} from "../lib/domain/canonical-manual-pilot";
import { APPLY_MIGRATION_CONFIRMATION, executeCanonicalMigrationPlan } from "../lib/services/canonical-subscription-migration-service";
import { ACTIVATE_MANUAL_PILOT_CONFIRMATION, activateCanonicalManualPilot, getCanonicalManualPilotReview } from "../lib/services/canonical-manual-pilot-service";
import { buildCanonicalManualPilotMigrationPlan } from "../lib/services/canonical-manual-pilot-review-service";

const customerId = "5de4934a-c4ee-4e99-a599-9e757de5c6a9";
const sourceInvoiceId = "4e0d1d0b-3e50-478f-a725-12b70c0c8d97";
const subscriptionId = "922bbfe6-6c89-4c08-a596-c5168c211197";
const ownerEmail = "dane.elrus1@gmail.com";
const productionDeployment = "https://tlportal-fk3v8nldc-ellodanems-projects.vercel.app";
const vercelBase = ["vercel@latest", "--scope", "ellodanems-projects", "--non-interactive"];
const vercelEnvironmentBase = [...vercelBase, "--project", "tlportal"];
function runVercel(args: string[], input?: string, environmentCommand = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const commandBase = environmentCommand ? vercelEnvironmentBase : vercelBase;
    // Windows cannot execute the npm-generated npx.cmd shim directly through
    // spawn(). Run it through the command shell; every argument is fixed by
    // this script and the approval secret is supplied only through stdin.
    const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", [...commandBase, ...args], {
      stdio: ["pipe", "inherit", "inherit"],
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Vercel command failed (${code ?? "unknown"}).`)));
    child.stdin.end(input);
  });
}

async function setVercelProductionVariable(name: string, value: string, type: "config" | "secret") {
  await runVercel(["env", "add", name, "production", "--force", "--type", type, "--yes"], value, true);
}

async function removeTemporaryVercelVariables(names: readonly string[]) {
  for (const name of names) await runVercel(["env", "remove", name, "production", "--yes"], undefined, true);
}

async function redeployProduction() {
  await runVercel(["redeploy", productionDeployment, "--target", "production"]);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function requirePostgresUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be supplied by the owner’s secure production terminal.`);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("unsupported protocol");
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL connection URL.`);
  }
  return value;
}

async function main() {
  const directDatabaseUrl = requirePostgresUrl("DATABASE_URL");
  const runtimeDatabaseUrl = requirePostgresUrl("TLPORTAL_RUNTIME_DATABASE_URL");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const temporaryConfigured: string[] = [];
  try {
    const credentialsRotated = (await rl.question("After rotating the exposed Neon credential and obtaining fresh pooled and direct URLs, type NEON_CREDENTIALS_ROTATED to continue: ")).trim();
    if (credentialsRotated !== "NEON_CREDENTIALS_ROTATED") throw new Error("Rotated Neon credentials must be explicitly confirmed before production operations.");
    const snapshotConfirmed = (await rl.question("After creating the fresh Neon recovery snapshot, type NEON_SNAPSHOT_CONFIRMED to continue: ")).trim();
    if (snapshotConfirmed !== "NEON_SNAPSHOT_CONFIRMED") throw new Error("A fresh Neon recovery snapshot must be explicitly confirmed before production writes.");
    const confirmation = (await rl.question("Type AUTHORIZE_RONDELL_PRODUCTION_PILOT to sign, migrate, activate January billing, and clean up temporary signing configuration: ")).trim();
    if (confirmation !== "AUTHORIZE_RONDELL_PRODUCTION_PILOT") throw new Error("Owner authorization was not confirmed.");

    const assignments = await prisma.serviceAssignment.findMany({
      where: { customerId, endDate: null, status: { in: ["active", "due_soon", "overdue"] }, intervalMonths: 3, subscriptionItemId: null },
      select: { id: true }, orderBy: { id: "asc" },
    });
    if (assignments.length !== 14) throw new Error(`Expected exactly 14 active quarterly assignments; found ${assignments.length}.`);
    const analysisDate = dateOnly(new Date());
    const plan = await buildCanonicalManualPilotMigrationPlan({
      proposalId: `manual-invoice:${sourceInvoiceId}`,
      approvedBy: ownerEmail, approvedAt: new Date().toISOString(),
      approvalReason: "Owner-confirmed established manual cheque arrangement: 14 active GPS tracking services at EC$60 per service quarterly; TL-INV-100938 is EC$840 tax-free coverage from 2026-10-15 through 2027-01-15; canonical billing begins at the unbilled 2027-01-15 renewal.",
      name: "Rondell Springer tracking services", reference: "manual-invoice-TL-INV-100938",
      commercialStartDate: "2026-10-15", billingAnchorDate: "2026-10-15", nextBillingDate: "2027-01-15",
      sourceCoverageStartDate: "2026-10-15", sourceCoverageEndDate: "2027-01-15", sourceCoverageConfirmed: true, gracePeriodDays: 7,
      items: assignments.map((assignment, index) => ({ assignmentId: assignment.id, label: `GPS tracking service ${index + 1}`, agreedAmountPerCycle: "60.00", classification: "negotiated" as const })),
    }, analysisDate);
    const entry = plan.entries[0];
    if (!entry || entry.target.expectedTotalAmountPerCycle !== "840.00" || entry.target.items.length !== 14) throw new Error("The reviewed EC$840 / 14-service plan did not reproduce exactly.");

    // The secret remains only in this process memory and Vercel’s secret store.
    const secret = randomBytes(48).toString("base64url");
    const environment: CanonicalManualPilotEnvironment = {
      NODE_ENV: "production", VERCEL_ENV: "production",
      CANONICAL_MANUAL_PILOT_ENABLED: "true", CANONICAL_MANUAL_PILOT_CUSTOMER_ID: customerId,
      CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID: subscriptionId, CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID: sourceInvoiceId,
      CANONICAL_MANUAL_PILOT_OWNER_EMAIL: ownerEmail, CANONICAL_MANUAL_PILOT_APPROVAL_SECRET: secret,
    };
    // Rotate the two application connection strings before any pilot operation.
    // DATABASE_URL is the pooled runtime URL; DIRECT_URL is the direct URL used
    // by Prisma migrations. Values are supplied through stdin and stored as secrets.
    await setVercelProductionVariable("DATABASE_URL", runtimeDatabaseUrl, "secret");
    await setVercelProductionVariable("DIRECT_URL", directDatabaseUrl, "secret");
    await redeployProduction();

    // These three exact-scope variables remain after successful activation.
    await setVercelProductionVariable("CANONICAL_MANUAL_PILOT_ENABLED", "true", "config");
    await setVercelProductionVariable("CANONICAL_MANUAL_PILOT_CUSTOMER_ID", customerId, "config");
    await setVercelProductionVariable("CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID", subscriptionId, "config");
    await setVercelProductionVariable("CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID", sourceInvoiceId, "config");
    temporaryConfigured.push("CANONICAL_MANUAL_PILOT_SOURCE_INVOICE_ID");
    await setVercelProductionVariable("CANONICAL_MANUAL_PILOT_OWNER_EMAIL", ownerEmail, "config");
    temporaryConfigured.push("CANONICAL_MANUAL_PILOT_OWNER_EMAIL");
    await setVercelProductionVariable("CANONICAL_MANUAL_PILOT_APPROVAL_SECRET", secret, "secret");
    temporaryConfigured.push("CANONICAL_MANUAL_PILOT_APPROVAL_SECRET");
    await redeployProduction();

    const issuedAt = new Date(); const expiresAt = new Date(issuedAt.getTime() + 30 * 60 * 1000);
    const unsignedMigration: Omit<CanonicalManualPilotMigrationAuthorization, "signature"> = {
      authorizationId: randomUUID(), operation: "migrate_manual_pilot_shadow", customerId, targetSubscriptionId: subscriptionId,
      sourceKind: "manual_invoice", legacyScheduleId: null, sourceInvoiceId, migrationKey: entry.migrationKey,
      migrationSourceFingerprint: entry.sourceFingerprint, migrationPlanFingerprint: plan.planFingerprint,
      currency: "XCD", billingIntervalMonths: 3, recurringAmount: "840.00", cutoverPeriodStart: "2027-01-15",
      approvedByEmail: ownerEmail, approvalReason: entry.approvalReason,
      customerIdentityConfirmed: true, commercialTermsConfirmed: true, sourceScheduleConfirmed: true, historicalBalancesConfirmed: true,
      issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(),
    };
    const migrationAuthorization = { ...unsignedMigration, signature: signCanonicalManualPilotMigrationAuthorization(unsignedMigration, environment) };
    const before = { invoices: await prisma.invoice.count({ where: { customerId } }), payments: await prisma.payment.count({ where: { customerId } }) };
    const migration = await executeCanonicalMigrationPlan(plan, { execute: true, confirmation: APPLY_MIGRATION_CONFIRMATION, environment, pilotAuthorization: migrationAuthorization });
    if (migration.entries[0]?.targetSubscriptionId !== subscriptionId) throw new Error("Shadow migration returned an unexpected subscription ID.");

    const review = await getCanonicalManualPilotReview(subscriptionId);
    if (review.blockers.length) throw new Error(`Shadow review blocked activation: ${review.blockers.join(" ")}`);
    const activationIssuedAt = new Date(); const activationExpiresAt = new Date(activationIssuedAt.getTime() + 30 * 60 * 1000);
    const unsignedActivation: Omit<CanonicalManualPilotAuthorization, "signature"> = {
      authorizationId: randomUUID(), operation: "activate_manual_pilot", proposalFingerprint: "", approvedByEmail: ownerEmail,
      customerId, subscriptionId, migrationKey: review.proposal.migrationKey, sourceKind: "manual_invoice", legacyScheduleId: null,
      sourceInvoiceId, sourceStateFingerprint: review.proposal.sourceStateFingerprint, cutoverPeriodStart: "2027-01-15",
      billingIntervalMonths: 3, currency: "XCD", recurringAmount: "840.00", approvalReason: "Owner-approved January 15, 2027 canonical billing authority transfer after shadow review.",
      customerIdentityConfirmed: true, commercialTermsConfirmed: true, historicalBalancesConfirmed: true,
      legacyScheduleStopConfirmed: true, canonicalScheduleStartConfirmed: true, recoveryProcedureConfirmed: true,
      issuedAt: activationIssuedAt.toISOString(), expiresAt: activationExpiresAt.toISOString(),
    };
    const { canonicalManualPilotProposalFingerprint } = await import("../lib/domain/canonical-manual-pilot");
    unsignedActivation.proposalFingerprint = canonicalManualPilotProposalFingerprint(review.proposal);
    const activationAuthorization = { ...unsignedActivation, signature: signCanonicalManualPilotAuthorization(unsignedActivation, environment) };
    const activation = await activateCanonicalManualPilot({ subscriptionId, authorization: activationAuthorization, execute: true, confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION, environment });
    const original = await prisma.invoice.findUniqueOrThrow({ where: { id: sourceInvoiceId }, select: { number: true, subtotal: true, total: true, customerSubscriptionId: true, recurringScheduleId: true } });
    const after = { invoices: await prisma.invoice.count({ where: { customerId } }), payments: await prisma.payment.count({ where: { customerId } }) };
    if (before.invoices !== after.invoices || before.payments !== after.payments) throw new Error("Unexpected financial side effect detected; stop and reconcile.");
    console.log(JSON.stringify({ ok: true, snapshotConfirmed: true, subscriptionId, activationId: activation.activationId, canonicalScheduleId: activation.canonicalScheduleId, nextBillingDate: activation.cutoverPeriodStart, originalInvoice: { number: original.number, subtotal: original.subtotal.toFixed(2), total: original.total.toFixed(2), canonicalLink: original.customerSubscriptionId, scheduleLink: original.recurringScheduleId }, invoiceCountChanged: false, paymentCountChanged: false }, null, 2));
  } finally {
    if (temporaryConfigured.length) { await removeTemporaryVercelVariables(temporaryConfigured); await redeployProduction(); }
    await prisma.$disconnect(); rl.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
