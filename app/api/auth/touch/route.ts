import { cookies } from "next/headers";

import { sessionCookieFlags } from "@/lib/auth/cookie-options";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { getSession } from "@/lib/auth/get-session";
import { signSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true },
  });
  if (!user) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const token = await signSession({ sub: user.id, email: user.email });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieFlags(req));
  return Response.json({ ok: true });
}
