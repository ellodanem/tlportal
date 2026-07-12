import { cookies } from "next/headers";

import { sessionCookieFlags } from "@/lib/auth/cookie-options";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { isAuthConfigured } from "@/lib/auth/env";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  const email = normalizeEmail(String((body as { email?: string }).email ?? ""));
  const password = String((body as { password?: string }).password ?? "");

  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const credsOk = Boolean(user && (await verifyPassword(password, user.passwordHash)));
  if (!user || !credsOk) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signSession({ sub: user.id, email: user.email });
  const jar = await cookies();
  const flags = sessionCookieFlags(req);
  jar.set(SESSION_COOKIE, token, flags);

  return Response.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
