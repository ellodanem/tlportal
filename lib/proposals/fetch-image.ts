import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

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

function logoFromBuffer(buf: Buffer, mime: "image/png" | "image/jpeg"): LogoImage {
  const b64 = buf.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;
  return { dataUrl, format: mime === "image/png" ? "PNG" : "JPEG" };
}

/** `process.cwd()` can differ from the real app root in some setups — try a few roots. */
function candidatePublicRoots(): string[] {
  const cwd = process.cwd();
  const fromEnv = process.env.TL_PUBLIC_ROOT?.trim();
  const roots = new Set<string>();
  if (fromEnv) roots.add(path.resolve(fromEnv));
  roots.add(path.resolve(cwd, "public"));
  roots.add(path.resolve(cwd, "..", "public"));
  return [...roots];
}

function parseInlineDataImage(trimmed: string): LogoImage | null {
  const t = trimmed.trim();
  if (!t.startsWith("data:image/")) return null;
  const comma = t.indexOf(",");
  if (comma === -1) return null;
  const header = t.slice(0, comma);
  const b64 = t.slice(comma + 1).trim();
  const mimeMatch = /^data:(image\/png|image\/jpeg|image\/jpg)(;[^,]*)?$/i.exec(header);
  if (!mimeMatch || !b64) return null;
  try {
    const mimeRaw = mimeMatch[1]!.toLowerCase();
    const mime: "image/png" | "image/jpeg" =
      mimeRaw === "image/png" ? "image/png" : "image/jpeg";
    const buf = Buffer.from(b64, "base64");
    if (!buf.length) return null;
    return logoFromBuffer(buf, mime);
  } catch {
    return null;
  }
}

/** Read `public/...` from disk so PDF/DOCX export works without HTTP (no port / Host issues). */
async function tryLoadPublicStaticImage(sitePath: string): Promise<LogoImage | null> {
  const posix = sitePath.trim().replace(/\\/g, "/");
  if (!posix.startsWith("/") || posix.startsWith("//")) return null;
  const segments = posix.split("/").filter(Boolean);
  if (segments.some((s) => s === "..")) return null;

  const rel = segments.join(path.sep);

  for (const publicRoot of candidatePublicRoots()) {
    const abs = path.resolve(publicRoot, rel);
    const relFromPublic = path.relative(publicRoot, abs);
    if (relFromPublic.startsWith("..") || path.isAbsolute(relFromPublic)) continue;

    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;

    const ext = path.extname(abs).toLowerCase();
    const mime =
      ext === ".png"
        ? ("image/png" as const)
        : ext === ".jpg" || ext === ".jpeg"
          ? ("image/jpeg" as const)
          : null;
    if (!mime) continue;

    try {
      const buf = await fs.readFile(abs);
      return logoFromBuffer(buf, mime);
    } catch {
      continue;
    }
  }

  return null;
}

export async function fetchImageAsLogo(origin: string, pathOrUrl: string | null | undefined): Promise<LogoImage | null> {
  if (!pathOrUrl?.trim()) return null;
  const trimmed = pathOrUrl.trim();

  const inline = parseInlineDataImage(trimmed);
  if (inline) return inline;

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

  const isHttp = trimmed.startsWith("http://") || trimmed.startsWith("https://");
  if (!isHttp) {
    const sitePath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const fromDisk = await tryLoadPublicStaticImage(sitePath);
    if (fromDisk) return fromDisk;
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
