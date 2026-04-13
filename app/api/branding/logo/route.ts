import { get } from "@vercel/blob";

import { getSession } from "@/lib/auth/get-session";
import {
  BRANDING_PRIVATE_BLOB_PREFIX,
  getBrandingLogoStored,
  stripBrandingPrivateBlobPrefix,
} from "@/lib/branding/app-settings";

export const runtime = "nodejs";

/**
 * Streams the admin branding logo when it lives on a private Vercel Blob store.
 * Public blob URLs are used directly and do not hit this route.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stored = await getBrandingLogoStored();
  if (!stored?.startsWith(BRANDING_PRIVATE_BLOB_PREFIX)) {
    return new Response("Not found", { status: 404 });
  }

  const blobUrl = stripBrandingPrivateBlobPrefix(stored);
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const ifNoneMatch = req.headers.get("if-none-match") ?? undefined;
  const out = await get(blobUrl, { access: "private", token, ifNoneMatch });
  if (!out) {
    return new Response("Not found", { status: 404 });
  }

  if (out.statusCode === 304) {
    const h = new Headers();
    if (out.blob.etag) h.set("ETag", out.blob.etag);
    return new Response(null, { status: 304, headers: h });
  }
  if (out.statusCode !== 200 || !out.stream) {
    return new Response("Not found", { status: 404 });
  }

  const contentType = out.blob.contentType;
  if (!contentType) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
  });
  if (out.blob.etag) headers.set("ETag", out.blob.etag);

  return new Response(out.stream, { headers });
}
