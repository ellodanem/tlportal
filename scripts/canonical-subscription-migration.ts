import { readFile } from "node:fs/promises";

import {
  createCanonicalMigrationPlan,
  type CanonicalMigrationApproval,
  type CanonicalMigrationPlan,
} from "../lib/domain/canonical-subscription-migration";
import type { LegacyBillingSnapshot } from "../lib/domain/subscription-migration-analysis";

function usage(): never {
  throw new Error([
    "Usage:",
    "  npm run billing:canonical-migration -- plan <snapshot.json> <approvals.json>",
    "  npm run billing:canonical-migration -- apply <plan.json> --execute APPLY_SHADOW_CANONICAL_MIGRATION",
    "  npm run billing:canonical-migration -- reverse <migration-key> --execute REVERSE_UNUSED_SHADOW_MIGRATION",
    "",
    "Apply and reverse also require ALLOW_CANONICAL_MIGRATION_EXECUTION=true and a localhost test/local/dev database URL.",
  ].join("\n"));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function executionToken(args: string[]): string {
  const index = args.indexOf("--execute");
  if (index < 0 || !args[index + 1]) usage();
  return args[index + 1];
}

async function main() {
  const [command, subject, ...rest] = process.argv.slice(2);
  if (!command || !subject) usage();

  if (command === "plan") {
    const approvalPath = rest[0];
    if (!approvalPath) usage();
    const snapshot = await readJson<LegacyBillingSnapshot>(subject);
    const approval = await readJson<CanonicalMigrationApproval>(approvalPath);
    process.stdout.write(`${JSON.stringify(createCanonicalMigrationPlan(snapshot, approval), null, 2)}\n`);
    return;
  }

  const service = await import("../lib/services/canonical-subscription-migration-service");
  if (command === "apply") {
    const token = executionToken(rest);
    if (token !== service.APPLY_MIGRATION_CONFIRMATION) usage();
    const plan = await readJson<CanonicalMigrationPlan>(subject);
    const result = await service.executeCanonicalMigrationPlan(plan, {
      execute: true,
      confirmation: service.APPLY_MIGRATION_CONFIRMATION,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "reverse") {
    const token = executionToken(rest);
    if (token !== service.REVERSE_MIGRATION_CONFIRMATION) usage();
    const result = await service.reverseCanonicalMigration(subject, {
      execute: true,
      confirmation: service.REVERSE_MIGRATION_CONFIRMATION,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
