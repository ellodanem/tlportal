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

export function sessionCookieFlags(req: Request, rememberMe = true) {
  const secure = process.env.NODE_ENV === "production" && isHttpsRequest(req);
  const maxAge = 60 * 60 * 24 * 7;
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    ...(rememberMe ? { maxAge } : {}),
  };
}
