import { appendFileSync } from "fs";
import { join } from "path";

/** Writes one NDJSON line to workspace `debug-79eeac.log` (Node only). */
export function debugAgentLog(data: Record<string, unknown>): void {
  const line =
    JSON.stringify({
      sessionId: "79eeac",
      timestamp: Date.now(),
      ...data,
    }) + "\n";
  try {
    appendFileSync(join(process.cwd(), "debug-79eeac.log"), line, { encoding: "utf8" });
  } catch {
    // ignore
  }
}
