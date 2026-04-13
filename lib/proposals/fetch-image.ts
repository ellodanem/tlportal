import "server-only";

import type { LogoImage } from "@/lib/proposals/pdf";
import { resolvePublicAssetUrl } from "@/lib/proposals/resolve-asset-url";

function toDataUrl(buf: ArrayBuffer, mime: string): string {
  const b64 = Buffer.from(buf).toString("base64");
  return `data:${mime};base64,${b64}`;
}

export async function fetchImageAsLogo(origin: string, pathOrUrl: string | null | undefined): Promise<LogoImage | null> {
  if (!pathOrUrl?.trim()) return null;
  const url = resolvePublicAssetUrl(origin, pathOrUrl);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
    const buf = await res.arrayBuffer();
    if (mime === "image/png") {
      return { dataUrl: toDataUrl(buf, mime), format: "PNG" };
    }
    if (mime === "image/jpeg" || mime === "image/jpg") {
      return { dataUrl: toDataUrl(buf, "image/jpeg"), format: "JPEG" };
    }
    return null;
  } catch {
    return null;
  }
}
