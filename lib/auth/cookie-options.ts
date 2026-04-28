import { SESSION_MAX_AGE_SEC } from "./constants";

/**
 * Secure session cookies only over HTTPS so `next start` / LAN access on http:// still works.
 * Browsers ignore Set-Cookie with Secure=true on plain HTTP.
 */
export function isHttpsRequest(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === "https:") {
    return true;
  }
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return proto === "https";
}

export function sessionCookieFlags(req: Request) {
  const secure = process.env.NODE_ENV === "production" && isHttpsRequest(req);
  const maxAge = SESSION_MAX_AGE_SEC;
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
