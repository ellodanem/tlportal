import { cookies } from "next/headers";

import { sessionCookieFlags } from "@/lib/auth/cookie-options";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { debugAgentLog } from "@/lib/debug-agent-log";
import { isAuthConfigured } from "@/lib/auth/env";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // #region agent log
  fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
    body: JSON.stringify({
      sessionId: "79eeac",
      location: "app/api/auth/login/route.ts:POST",
      message: "login_api_entry",
      data: { authConfigured: isAuthConfigured() },
      timestamp: Date.now(),
      hypothesisId: "H2",
      runId: "pre-fix",
    }),
    }).catch(() => {});
  debugAgentLog({
    location: "app/api/auth/login/route.ts:POST",
    message: "login_api_entry",
    data: { authConfigured: isAuthConfigured() },
    hypothesisId: "H2",
    runId: "pre-fix",
  });
  // #endregion
  if (!isAuthConfigured()) {
    return Response.json(
      { error: "AUTH_SECRET is not set (min 32 characters)" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String((body as { email?: string }).email ?? "")
    .trim()
    .toLowerCase();
  const password = String((body as { password?: string }).password ?? "");

  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const credsOk = Boolean(user && (await verifyPassword(password, user.passwordHash)));
  // #region agent log
  fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
    body: JSON.stringify({
      sessionId: "79eeac",
      location: "app/api/auth/login/route.ts:afterVerify",
      message: "credentials_check",
      data: { userFound: Boolean(user), credsOk },
      timestamp: Date.now(),
      hypothesisId: "H2",
      runId: "pre-fix",
    }),
    }).catch(() => {});
  debugAgentLog({
    location: "app/api/auth/login/route.ts:afterVerify",
    message: "credentials_check",
    data: { userFound: Boolean(user), credsOk },
    hypothesisId: "H2",
    runId: "pre-fix",
  });
  // #endregion
  if (!user || !credsOk) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signSession({ sub: user.id, email: user.email });
  const jar = await cookies();
  const flags = sessionCookieFlags(req);
  jar.set(SESSION_COOKIE, token, flags);
  // #region agent log
  fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
    body: JSON.stringify({
      sessionId: "79eeac",
      location: "app/api/auth/login/route.ts:cookieSet",
      message: "session_cookie_set",
      data: { secure: flags.secure, sameSite: flags.sameSite },
      timestamp: Date.now(),
      hypothesisId: "H3",
      runId: "pre-fix",
    }),
    }).catch(() => {});
  debugAgentLog({
    location: "app/api/auth/login/route.ts:cookieSet",
    message: "session_cookie_set",
    data: { secure: flags.secure, sameSite: flags.sameSite },
    hypothesisId: "H3",
    runId: "post-fix",
  });
  // #endregion

  return Response.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
