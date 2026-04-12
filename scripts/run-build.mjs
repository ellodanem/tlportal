/**
 * Production build: migrate (needs a real DB connection), generate, next build.
 * - Neon: set DIRECT_URL to the non-pooled connection string; keep DATABASE_URL pooled for runtime.
 * - If DIRECT_URL is unset, falls back to DATABASE_URL (works for local Docker; Neon pooler may still lock-timeout).
 * - Migrate runs with DATABASE_URL forced to DIRECT_URL when DIRECT_URL is set so the CLI never uses the pooler
 *   for session locks (see README). Prisma’s migrate advisory lock wait is ~10s; transient P1002 is retried.
 * - On Vercel (`VERCEL=1`), migrate deploy sets PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK unless opted out — P1002 often
 *   persists until lock holder exits; disabling the lock is Prisma’s supported escape hatch when only one migrate runs at a time.
 */
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const env = { ...process.env };

if (!env.DIRECT_URL?.trim() && env.DATABASE_URL?.trim()) {
  env.DIRECT_URL = env.DATABASE_URL;
}

const dbUrl = env.DATABASE_URL ?? "";
const looksLikePooler =
  dbUrl.includes("-pooler") || /[?&]pgbouncer=true(?:&|$)/i.test(dbUrl);
if (looksLikePooler && env.DIRECT_URL === dbUrl) {
  console.warn(
    "\n[tlportal build] DATABASE_URL looks like a pooler URL but DIRECT_URL is not set to a separate direct URL.",
    "Prisma migrate often hits P1002 advisory lock timeouts on the pooler.",
    "Set DIRECT_URL in Vercel to Neon’s direct connection string (see README Deploy).\n",
  );
}

let loggedAdvisoryLockBypass = false;

/** Env for `prisma migrate deploy`: prefer a single non-pooled connection for session locks. */
function migrateEnv() {
  const e = { ...env };
  const direct = e.DIRECT_URL?.trim();
  if (direct) {
    e.DATABASE_URL = direct;
  }
  // Vercel: repeated P1002 is common (overlapping deploys, pooler, or a stuck session). Prisma allows disabling the lock.
  const onVercel = e.VERCEL === "1";
  const keepLock = e.TLPORTAL_KEEP_MIGRATE_ADVISORY_LOCK === "1";
  const userChoseLock = Boolean(e.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK?.trim());
  if (onVercel && !keepLock && !userChoseLock) {
    e.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "1";
    if (!loggedAdvisoryLockBypass) {
      loggedAdvisoryLockBypass = true;
      console.warn(
        "\n[tlportal build] VERCEL=1: PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 for prisma migrate deploy.",
        "Do not run two migrate deploys against the same DB at once (e.g. parallel production deploys or previews hitting prod).",
        "Set TLPORTAL_KEEP_MIGRATE_ADVISORY_LOCK=1 to opt out. See README Deploy (P1002).\n",
      );
    }
  }
  return e;
}

const MIGRATE_ATTEMPTS = 4;
const MIGRATE_RETRY_MS = [0, 12_000, 24_000, 36_000];

function migrateOutputRetryable(text) {
  return /P1002|advisory lock|Timed out trying to acquire/i.test(text ?? "");
}

function runMigrateDeployOnce(migrateProcessEnv) {
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: migrateProcessEnv,
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const combined = `${stdout}\n${stderr}`;
  return { status: r.status ?? 1, combined };
}

function run(label, command, args, childEnv = env) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
    env: childEnv,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`Build step failed: ${label} (exit ${r.status ?? "unknown"})`);
    process.exit(r.status ?? 1);
  }
}

async function runMigrateWithRetries() {
  const mEnv = migrateEnv();
  for (let i = 0; i < MIGRATE_ATTEMPTS; i++) {
    await delay(MIGRATE_RETRY_MS[i] ?? 12_000);
    if (i > 0) {
      console.warn(
        `[tlportal build] prisma migrate deploy retry ${i + 1}/${MIGRATE_ATTEMPTS} (after lock timeout)…`,
      );
    }
    const { status, combined } = runMigrateDeployOnce(mEnv);
    if (status === 0) return;
    const last = i === MIGRATE_ATTEMPTS - 1;
    const retryable = migrateOutputRetryable(combined);
    if (!retryable || last) {
      console.error(`Build step failed: prisma migrate deploy (exit ${status})`);
      process.exit(status);
    }
  }
}

if (env.SKIP_PRISMA_MIGRATE_ON_BUILD === "1") {
  console.warn(
    "\n[tlportal build] SKIP_PRISMA_MIGRATE_ON_BUILD=1 — skipping prisma migrate deploy.",
    "Apply migrations manually (e.g. CI or `npx prisma migrate deploy` against DIRECT_URL) before relying on new schema.\n",
  );
} else {
  await runMigrateWithRetries();
}
run("prisma generate", "npx", ["prisma", "generate"]);
run("next build", "npx", ["next", "build"]);
