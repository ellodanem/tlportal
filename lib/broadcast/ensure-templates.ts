import "server-only";

import { prisma } from "@/lib/db";

import { DEFAULT_BROADCAST_TEMPLATES } from "./default-templates";

/** Upsert system templates by slug (safe on every admin visit). */
export async function ensureBroadcastTemplates(): Promise<void> {
  for (const t of DEFAULT_BROADCAST_TEMPLATES) {
    await prisma.broadcastTemplate.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        name: t.name,
        category: t.category,
        subject: t.subject,
        bodyText: t.bodyText,
        isSystem: true,
        isActive: true,
        sortOrder: t.sortOrder,
      },
      update: {
        name: t.name,
        category: t.category,
        sortOrder: t.sortOrder,
      },
    });
  }
}
