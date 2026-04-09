import { jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";

/** Keep in sync with `lib/auth/session.ts` (Node) — Edge cannot import that file. */
const SESSION_COOKIE = "tl_session";
const SESSION_ISS = "tl-portal";
const SESSION_AUD = "admin";

async function verifySessionTokenEdge(token: string): Promise<boolean> {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 32) {
    return false;
  }
  const secret = new TextEncoder().encode(s);
  try {
    await jwtVerify(token, secret, {
      issuer: SESSION_ISS,
      audience: SESSION_AUD,
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

function debugMw(
  message: string,
  data: Record<string, string | boolean | number | undefined>,
  hypothesisId: string,
) {
  // #region agent log
  fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
    body: JSON.stringify({
      sessionId: "79eeac",
      location: "middleware.ts",
      message,
      data,
      timestamp: Date.now(),
      hypothesisId,
      runId: "pre-fix",
    }),
  }).catch(() => {});
  // #endregion
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    debugMw("admin_no_token_redirect_login", { path, hasToken: false }, "H4");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ok = await verifySessionTokenEdge(token);
  if (!ok) {
    debugMw("admin_token_verify_failed_redirect_login", { path, hasToken: true, verifyOk: false }, "H4");
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  debugMw("admin_ok", { path, hasToken: true, verifyOk: true }, "H4");
  return NextResponse.next();
}

export const config = {
  // Include `/admin` explicitly (some matchers only hit nested paths).
  matcher: ["/admin", "/admin/:path*"],
};
