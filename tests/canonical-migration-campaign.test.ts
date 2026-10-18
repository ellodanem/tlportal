import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLY_MIGRATION_CONFIRMATION,
  assertCampaignMigrationExecutionGuard,
  CanonicalMigrationExecutionError,
} from "../lib/services/canonical-subscription-migration-service";

test("campaign migration execution is default-deny until the exact switch is enabled", () => {
  assert.throws(
    () => assertCampaignMigrationExecutionGuard({
      execute: true,
      confirmation: APPLY_MIGRATION_CONFIRMATION,
      authorization: { campaignEntryId: "campaign-entry", approvedBy: "owner@example.test" },
      environment: {},
    }),
    (error: unknown) => error instanceof CanonicalMigrationExecutionError && error.code === "CAMPAIGN_EXECUTION_DISABLED",
  );
});

test("campaign migration execution requires an exact owner-approved entry and confirmation", () => {
  assert.throws(
    () => assertCampaignMigrationExecutionGuard({
      execute: true,
      confirmation: "wrong",
      authorization: { campaignEntryId: "", approvedBy: "" },
      environment: { CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED: "true" },
    }),
    (error: unknown) => error instanceof CanonicalMigrationExecutionError && error.code === "EXPLICIT_EXECUTION_REQUIRED",
  );
  assert.doesNotThrow(() => assertCampaignMigrationExecutionGuard({
    execute: true,
    confirmation: APPLY_MIGRATION_CONFIRMATION,
    authorization: { campaignEntryId: "campaign-entry", approvedBy: "owner@example.test" },
    environment: { CANONICAL_MIGRATION_CAMPAIGN_EXECUTION_ENABLED: "true" },
  }));
});
