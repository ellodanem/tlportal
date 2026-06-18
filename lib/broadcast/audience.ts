import "server-only";

import { customerDisplayName } from "@/lib/admin/customer-list";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { prisma } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BroadcastRecipient = {
  customerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  displayName: string;
};

export type BroadcastAudiencePreview = {
  recipientCount: number;
  skippedNoEmail: number;
  duplicateEmailsCollapsed: number;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export async function resolveBroadcastRecipients(includeInactive: boolean): Promise<{
  recipients: BroadcastRecipient[];
  preview: BroadcastAudiencePreview;
}> {
  const customers = await prisma.customer.findMany({
    where: includeInactive
      ? activeCustomerWhere
      : {
          ...activeCustomerWhere,
          serviceAssignments: {
            some: { endDate: null, status: { not: "cancelled" } },
          },
        },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
    },
  });

  let skippedNoEmail = 0;
  const withEmail: BroadcastRecipient[] = [];

  for (const c of customers) {
    const raw = c.email?.trim() ?? "";
    if (!raw || !isValidEmail(raw)) {
      skippedNoEmail += 1;
      continue;
    }
    withEmail.push({
      customerId: c.id,
      email: raw,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      displayName: customerDisplayName(c),
    });
  }

  const byEmail = new Map<string, BroadcastRecipient>();
  for (const r of withEmail) {
    const key = normalizeEmail(r.email);
    if (!byEmail.has(key)) {
      byEmail.set(key, r);
    }
  }

  const recipients = [...byEmail.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const duplicateEmailsCollapsed = withEmail.length - recipients.length;

  return {
    recipients,
    preview: {
      recipientCount: recipients.length,
      skippedNoEmail,
      duplicateEmailsCollapsed,
    },
  };
}

export async function getBroadcastAudiencePreview(includeInactive: boolean): Promise<BroadcastAudiencePreview> {
  const { preview } = await resolveBroadcastRecipients(includeInactive);
  return preview;
}
