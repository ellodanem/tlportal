import "server-only";

export type TimelineStep = { title: string; detail: string };

export function parseTimelineSteps(raw: unknown): TimelineStep[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: TimelineStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? "").trim();
    if (!title) continue;
    const detail = String(o.detail ?? "").trim();
    out.push({ title, detail });
  }
  return out.slice(0, 8);
}
