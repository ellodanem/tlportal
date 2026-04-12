/**
 * Production build: migrate (needs a real DB connection), generate, next build.
 * - Neon: set DIRECT_URL to the non-pooled connection string; keep DATABASE_URL pooled for runtime.
 * - If DIRECT_URL is unset, falls back to DATABASE_URL (works for local Docker; Neon pooler may still lock-timeout).
 * - Migrate runs with DATABASE_URL forced to DIRECT_URL when DIRECT_URL is set so the CLI never uses the pooler
 *   for advisory locks (see README). Prisma’s migrate advisory lock wait is ~10s; transient P1002 is retried.
 */
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const env = { ...process.env };

if (!env.DIRECT_URL?.trim() && env.DATABASE_URL?.trim()) {
  env.DIRECT_URL = env.DATABASE_URL;
}

const dbUrl = env.DATABASE_URL ?? "";
if (dbUrl.includes("-pooler") && env.DIRECT_URL === dbUrl) {
  console.warn(
    "\n[tlportal build] DATABASE_URL uses Neon pooler but DIRECT_URL is not set to a direct (non-pooler) URL.",
    "Prisma migrate often hits P1002 advisory lock timeouts on the pooler.",
    "Set DIRECT_URL in Vercel to Neon’s direct connection string (see README Deploy).\n",
  );
}

/** Env for `prisma migrate deploy`: prefer a single non-pooled connection for session locks. */
function migrateEnv() {
  const e = { ...env };
  const direct = e.DIRECT_URL?.trim();
  if (direct) {
    e.DATABASE_URL = direct;
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

await runMigrateWithRetries();
run("prisma generate", "npx", ["prisma", "generate"]);
run("next build", "npx", ["next", "build"]);
