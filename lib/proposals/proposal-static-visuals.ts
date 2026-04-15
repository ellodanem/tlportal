import "server-only";

import type { ProposalVisualBlock } from "@prisma/client";

/**
 * Committed file under `public/` — PDF/DOCX always use this for the matching section title
 * so export does not depend on uploads or DB `imageUrl`.
 */
export const STATIC_PLATFORM_AT_GLANCE_PATH = "/uploads/proposals/static/platform-at-a-glance.png";

const TITLE_TO_STATIC_PATH = new Map<string, string>([
  ["platform at a glance", STATIC_PLATFORM_AT_GLANCE_PATH],
]);

/** If this visual’s title has a bundled static image, that path wins over `imageUrl`. */
export function effectiveVisualImageUrlForExport(vis: Pick<ProposalVisualBlock, "title" | "imageUrl">): string | null {
  const staticPath = TITLE_TO_STATIC_PATH.get(vis.title.trim().toLowerCase());
  if (staticPath) return staticPath;
  const u = vis.imageUrl?.trim();
  return u?.length ? u : null;
}
