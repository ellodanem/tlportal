import { readFile } from "node:fs/promises";

import type {
  CanonicalManualPilotAuthorization,
  CanonicalManualPilotMigrationAuthorization,
} from "../lib/domain/canonical-manual-pilot";
import type { CanonicalMigrationPlan } from "../lib/domain/canonical-subscription-migration";

function usage(): never {
  throw new Error([
    "Usage:",
    "  npm run billing:manual-pilot -- review <canonical-subscription-id>",
    "  npm run billing:manual-pilot -- migrate <plan.json> <migration-authorization.json> --execute APPLY_SHADOW_CANONICAL_MIGRATION",
    "  npm run billing:manual-pilot -- activate <canonical-subscription-id> <activation-authorization.json> --execute ACTIVATE_ONE_MANUAL_CANONICAL_PILOT",
    "",
    "This command never creates an owner authorization. Production execution requires the exact allowlist and a separately signed, short-lived authorization.",
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
  const [command, subject, authorizationPath, ...rest] = process.argv.slice(2);
  if (!command || !subject) usage();

  if (command === "review") {
    const { getCanonicalManualPilotReview } = await import("../lib/services/canonical-manual-pilot-service");
    const review = await getCanonicalManualPilotReview(subject);
    process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
    return;
  }

  if (!authorizationPath) usage();
  if (command === "migrate") {
    const service = await import("../lib/services/canonical-subscription-migration-service");
    if (executionToken(rest) !== service.APPLY_MIGRATION_CONFIRMATION) usage();
    const [plan, authorization] = await Promise.all([
      readJson<CanonicalMigrationPlan>(subject),
      readJson<CanonicalManualPilotMigrationAuthorization>(authorizationPath),
    ]);
    const result = await service.executeCanonicalMigrationPlan(plan, {
      execute: true,
      confirmation: service.APPLY_MIGRATION_CONFIRMATION,
      pilotAuthorization: authorization,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "activate") {
    const service = await import("../lib/services/canonical-manual-pilot-service");
    if (executionToken(rest) !== service.ACTIVATE_MANUAL_PILOT_CONFIRMATION) usage();
    const authorization = await readJson<CanonicalManualPilotAuthorization>(authorizationPath);
    const result = await service.activateCanonicalManualPilot({
      subscriptionId: subject,
      authorization,
      execute: true,
      confirmation: service.ACTIVATE_MANUAL_PILOT_CONFIRMATION,
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
