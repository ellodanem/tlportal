import { readFile } from "node:fs/promises";

import {
  analyzeSubscriptionMigration,
  subscriptionMigrationAnalysisCsv,
  subscriptionMigrationAnalysisMarkdown,
  type LegacyBillingSnapshot,
} from "../lib/domain/subscription-migration-analysis";

function usage(): never {
  throw new Error(
    "Usage: npx tsx scripts/subscription-migration-dry-run.ts <sanitized-snapshot.json> [json|csv|markdown]",
  );
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const format = process.argv[3] ?? "markdown";
  if (!inputPath || !["json", "csv", "markdown"].includes(format)) usage();

  const snapshot = JSON.parse(await readFile(inputPath, "utf8")) as LegacyBillingSnapshot;
  if (snapshot.schemaVersion !== "phase-2a-source-v1") {
    throw new Error("Unsupported or missing source snapshot schemaVersion.");
  }
  const analysis = analyzeSubscriptionMigration(snapshot);
  const output = format === "json"
    ? `${JSON.stringify(analysis, null, 2)}\n`
    : format === "csv"
      ? `${subscriptionMigrationAnalysisCsv(analysis)}\n`
      : subscriptionMigrationAnalysisMarkdown(analysis);
  process.stdout.write(output);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
