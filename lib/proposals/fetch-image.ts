import "server-only";

import { get } from "@vercel/blob";

import {
  BRANDING_PRIVATE_BLOB_PREFIX,
  stripBrandingPrivateBlobPrefix,
} from "@/lib/branding/app-settings";
import type { LogoImage } from "@/lib/proposals/pdf";
import { resolvePublicAssetUrl } from "@/lib/proposals/resolve-asset-url";

function toDataUrl(buf: ArrayBuffer, mime: string): string {
  const b64 = Buffer.from(buf).toString("base64");
  return `data:${mime};base64,${b64}`;
}

export async function fetchImageAsLogo(origin: string, pathOrUrl: string | null | undefined): Promise<LogoImage | null> {
  if (!pathOrUrl?.trim()) return null;
  const trimmed = pathOrUrl.trim();

  if (trimmed.startsWith(BRANDING_PRIVATE_BLOB_PREFIX)) {
    const blobUrl = stripBrandingPrivateBlobPrefix(trimmed);
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) return null;
    try {
      const out = await get(blobUrl, { access: "private", token });
      if (!out || out.statusCode !== 200 || !out.stream) return null;
      const buf = await new Response(out.stream).arrayBuffer();
      const rawMime = out.blob.contentType;
      if (!rawMime) return null;
      const mime = rawMime.split(";")[0]?.trim().toLowerCase() || "";
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

  const url = resolvePublicAssetUrl(origin, trimmed);
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
