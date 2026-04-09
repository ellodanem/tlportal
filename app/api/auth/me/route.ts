import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ user: null }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  if (!user) {
    return Response.json({ user: null }, { status: 401 });
  }

  return Response.json({ user });
}
