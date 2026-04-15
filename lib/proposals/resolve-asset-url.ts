import "server-only";

/** Turn stored logo/visual paths (or absolute URLs) into a fetchable URL on the server. */
export function resolvePublicAssetUrl(origin: string, pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const base = origin.replace(/\/$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

export function getServerOriginFromEnv(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_ORIGIN?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (fromEnv) {
    if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
      return fromEnv.replace(/\/$/, "");
    }
    return `https://${fromEnv.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

/**
 * Origin used when the PDF/DOCX builder `fetch`es `/uploads/...` paths.
 * Prefer `Host` / `X-Forwarded-*` because `new URL(req.url)` in Route Handlers can
 * default to `localhost:3000` while the app is actually served on another port (e.g. :3001).
 */
export function resolveAssetFetchOrigin(req: Request): string {
  const headerHost =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host")?.trim();
  if (headerHost) {
    const rawProto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()?.toLowerCase() || "";
    const proto =
      rawProto === "http" || rawProto === "https"
        ? rawProto
        : headerHost.startsWith("localhost") || headerHost.startsWith("127.0.0.1")
          ? "http"
          : "https";
    return `${proto}://${headerHost}`;
  }
  const referer = req.headers.get("referer")?.trim();
  if (referer) {
    try {
      const o = new URL(referer).origin;
      if (o && o !== "null") return o;
    } catch {
      /* fall through */
    }
  }
  try {
    const origin = new URL(req.url).origin;
    if (origin && origin !== "null") return origin;
  } catch {
    /* fall through */
  }
  return getServerOriginFromEnv();
}
