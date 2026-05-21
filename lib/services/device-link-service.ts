import "server-only";

import type { GpsProvider, Prisma } from "@prisma/client";

import { traqcareGpsAdapter } from "@/lib/adapters/gps/traqcare/adapter";
import { prisma } from "@/lib/db";

const gpsAdapters = {
  traqcare: traqcareGpsAdapter,
} as const;

export async function getPrimaryGpsLink(deviceId: string) {
  return prisma.providerDeviceLink.findFirst({
    where: {
      deviceId,
      unlinkedAt: null,
      role: "primary",
    },
    orderBy: { linkedAt: "desc" },
  });
}

export async function getGpsLink(deviceId: string, provider: GpsProvider) {
  return prisma.providerDeviceLink.findUnique({
    where: {
      deviceId_provider: { deviceId, provider },
    },
  });
}

export type UpsertGpsLinkInput = {
  deviceId: string;
  provider: GpsProvider;
  portalUrl?: string | null;
  externalDeviceId?: string | null;
  externalAccountRef?: string | null;
};

export async function upsertGpsLink(input: UpsertGpsLinkInput) {
  const data: Prisma.ProviderDeviceLinkUpdateInput = {
    portalUrl: input.portalUrl?.trim() || null,
    externalDeviceId: input.externalDeviceId?.trim() || null,
    externalAccountRef: input.externalAccountRef?.trim() || null,
    unlinkedAt: null,
    role: "primary",
    linkedAt: new Date(),
  };

  return prisma.providerDeviceLink.upsert({
    where: {
      deviceId_provider: { deviceId: input.deviceId, provider: input.provider },
    },
    create: {
      deviceId: input.deviceId,
      provider: input.provider,
      portalUrl: data.portalUrl as string | null | undefined,
      externalDeviceId: data.externalDeviceId as string | null | undefined,
      externalAccountRef: data.externalAccountRef as string | null | undefined,
      role: "primary",
    },
    update: data,
  });
}

export function resolveGpsPortalUrl(
  link: Pick<
    import("@prisma/client").ProviderDeviceLink,
    "provider" | "portalUrl" | "externalAccountRef" | "externalDeviceId"
  >,
): string | null {
  const adapter = gpsAdapters[link.provider];
  if (!adapter) {
    return link.portalUrl?.trim() || null;
  }
  return adapter.resolvePortalUrl(link);
}
