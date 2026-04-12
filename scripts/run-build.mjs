/**
 * Production build: migrate (needs a real DB connection), generate, next build.
 * - Neon: set DIRECT_URL to the non-pooled connection string; keep DATABASE_URL pooled for runtime.
 * - If DIRECT_URL is unset, falls back to DATABASE_URL (works for local Docker; Neon pooler may still lock-timeout).
 */
import { spawnSync } from "node:child_process";

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

/** Longer lock wait when another session holds Prisma's migrate advisory lock (ms). */
if (!env.PRISMA_SCHEMA_ENGINE_ADVISORY_LOCK_TIMEOUT?.trim()) {
  env.PRISMA_SCHEMA_ENGINE_ADVISORY_LOCK_TIMEOUT = "120000";
}

function run(label, command, args) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`Build step failed: ${label} (exit ${r.status ?? "unknown"})`);
    process.exit(r.status ?? 1);
  }
}

run("prisma migrate deploy", "npx", ["prisma", "migrate", "deploy"]);
run("prisma generate", "npx", ["prisma", "generate"]);
run("next build", "npx", ["next", "build"]);
