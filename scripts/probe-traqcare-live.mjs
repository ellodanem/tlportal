import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env");
if (!existsSync(envPath)) {
  console.log("No .env file");
  process.exit(0);
}

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const key = m[1].trim();
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (key === "TRAQCARE_LIVE_API_BASE_URL" || key === "TRAQCARE_LIVE_API_KEY") {
    process.env[key] = val;
  }
}

const base = process.env.TRAQCARE_LIVE_API_BASE_URL?.trim();
const apiKey = process.env.TRAQCARE_LIVE_API_KEY?.trim();
console.log("base set:", Boolean(base));
console.log("key length:", apiKey?.length ?? 0);

if (!base || !apiKey) {
  console.log("Set TRAQCARE_LIVE_API_BASE_URL and TRAQCARE_LIVE_API_KEY in .env");
  process.exit(1);
}

const normalized = base.replace(/\/+$/, "");
const url = `${normalized}/live?key=${encodeURIComponent(apiKey)}`;
console.log("GET", `${normalized}/live?key=…`);

const res = await fetch(url);
const body = await res.text();
console.log("status:", res.status);
console.log(body.slice(0, 500));
