# Production preview preflight

This is a read-only checklist for the first canonical subscription UI preview. It does not authorize migrations, billing cutover, Stripe operations, invoice creation, payments, or customer migration.

## Owner-only production checks

Run the SQL below from an authorized Neon read-only console after confirming the database and project are the TL Portal production database. Do not paste connection strings, customer contact information, device identifiers, payment references, or query results containing sensitive values into tickets or chat.

### Migration state and database capabilities

```sql
SELECT current_database() AS database_name,
       current_user AS database_user,
       current_setting('server_version') AS postgres_version;

SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at, migration_name;

SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('plpgsql', 'btree_gist')
ORDER BY extname;

SELECT current_user AS database_user,
       has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage,
       has_schema_privilege(current_user, 'public', 'CREATE') AS public_create;
```

Compare the migration names with the repository's `prisma/migrations` directory. The next deployment must not be allowed to apply an unexpected migration. The canonical foundation requires `btree_gist`; if it is missing, stop and resolve the permission/environment issue before deployment.

### Constraint and legacy-data compatibility

These aggregate queries return counts only. A non-zero result requires a sanitized detail export using stable database IDs, not names, emails, phone numbers, IMEIs, SIM identifiers, or payment details.

```sql
-- Open canonical hardware assignments that would collide.
SELECT "subscriptionItemId", COUNT(*) AS row_count
FROM "ServiceAssignment"
WHERE "subscriptionItemId" IS NOT NULL
  AND "endDate" IS NULL
  AND "status" <> 'cancelled'
GROUP BY "subscriptionItemId"
HAVING COUNT(*) > 1;

-- Competing open provider relationships for one canonical subscription/provider.
SELECT "customerSubscriptionId", "provider", COUNT(*) AS row_count
FROM "SubscriptionProviderLink"
WHERE "endedAt" IS NULL
GROUP BY "customerSubscriptionId", "provider"
HAVING COUNT(*) > 1;

-- One external provider item mapped more than once.
SELECT "externalSubscriptionItemId", COUNT(*) AS row_count
FROM "SubscriptionProviderItem"
GROUP BY "externalSubscriptionItemId"
HAVING COUNT(*) > 1;

-- Overlapping effective-dated rates for the same item and billing interval.
SELECT a."subscriptionItemId", a."billingIntervalMonths", COUNT(*) AS overlap_count
FROM "SubscriptionItemRate" a
JOIN "SubscriptionItemRate" b
  ON b."subscriptionItemId" = a."subscriptionItemId"
 AND b."billingIntervalMonths" = a."billingIntervalMonths"
 AND b.id > a.id
 AND daterange(a."effectiveFrom", a."effectiveUntil", '[)')
     && daterange(b."effectiveFrom", b."effectiveUntil", '[)')
GROUP BY a."subscriptionItemId", a."billingIntervalMonths";

-- More than one open canonical recurring schedule.
SELECT "customerSubscriptionId", COUNT(*) AS row_count
FROM "RecurringInvoiceSchedule"
WHERE "customerSubscriptionId" IS NOT NULL
  AND "status" <> 'ended'
GROUP BY "customerSubscriptionId"
HAVING COUNT(*) > 1;

-- Duplicate recurring and annual-adjustment idempotency keys.
SELECT "recurringGenerationKey", COUNT(*) AS row_count
FROM "Invoice"
WHERE "recurringGenerationKey" IS NOT NULL
GROUP BY "recurringGenerationKey"
HAVING COUNT(*) > 1;

SELECT "adjustmentGenerationKey", COUNT(*) AS row_count
FROM "Invoice"
WHERE "adjustmentGenerationKey" IS NOT NULL
GROUP BY "adjustmentGenerationKey"
HAVING COUNT(*) > 1;

-- Duplicate immutable service attribution on one invoice.
SELECT "invoiceId", "subscriptionItemId", COUNT(*) AS row_count
FROM "InvoiceServiceSnapshot"
WHERE "subscriptionItemId" IS NOT NULL
GROUP BY "invoiceId", "subscriptionItemId"
HAVING COUNT(*) > 1;
```

Confirm the expected constraints exist without changing anything:

```sql
SELECT conname, contype
FROM pg_constraint
WHERE conname IN ('SubscriptionItemRate_no_overlapping_effective_periods');

SELECT indexname
FROM pg_indexes
WHERE indexname IN (
  'ServiceAssignment_one_open_subscription_item_idx',
  'SubscriptionProviderLink_one_open_provider_idx',
  'RecurringInvoiceSchedule_one_open_canonical_subscription_idx',
  'Invoice_adjustmentGenerationKey_key'
)
ORDER BY indexname;
```

## Vercel and billing checks

The owner should confirm in Vercel, without sharing secrets:

1. The target project and production branch are correct.
2. `DIRECT_URL` and `DATABASE_URL` point to the intended production Neon database, with the direct URL used for migrations.
3. `SKIP_PRISMA_MIGRATE_ON_BUILD` is not set unless the owner intentionally wants migrations deferred; the build wrapper runs `prisma migrate deploy` by default.
4. `CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE=true` is set only when the read-only preview is approved.
5. `CANONICAL_SUBSCRIPTION_UI_ENABLED` is not used to authorize production writes; production server actions still reject it.
6. Existing Stripe, cron, email, and payment environment variables are unchanged.

The first preview should be deployed only after the migration history and aggregate compatibility queries return clean results. The UI can then be smoke-tested with an authenticated staff account at `/admin/subscriptions/canonical` and `/admin/subscriptions/canonical/demo`.

## Stop conditions

Stop before deployment if migration history is incomplete or unexpected, `btree_gist` is unavailable, any collision query returns rows, the target database cannot be verified, or the production visibility flag cannot be restricted to the intended environment.
