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

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ok = await verifySessionTokenEdge(token);
  if (!ok) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Include `/admin` explicitly (some matchers only hit nested paths).
  matcher: ["/admin", "/admin/:path*"],
};
