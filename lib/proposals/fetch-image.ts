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

/** Read `public/...` from disk so PDF/DOCX export works when `APP_URL` points at another host (no HTTP round-trip). */
async function tryLoadPublicStaticImage(sitePath: string): Promise<LogoImage | null> {
  const posix = sitePath.trim().replace(/\\/g, "/");
  if (!posix.startsWith("/") || posix.startsWith("//")) return null;
  const segments = posix.split("/").filter(Boolean);
  if (segments.some((s) => s === "..")) return null;

  const rel = segments.join(path.sep);
  const publicRoot = path.resolve(process.cwd(), "public");
  const abs = path.resolve(publicRoot, rel);
  if (!abs.startsWith(publicRoot + path.sep) && abs !== publicRoot) return null;

  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;

  const ext = path.extname(abs).toLowerCase();
  const mime = ext === ".png" ? ("image/png" as const) : ext === ".jpg" || ext === ".jpeg" ? ("image/jpeg" as const) : null;
  if (!mime) return null;

  try {
    const buf = await fs.readFile(abs);
    return logoFromBuffer(buf, mime);
  } catch {
    return null;
  }
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
