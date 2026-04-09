import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "up" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ ok: false, database: "down", error: message }, { status: 503 });
  }
}
