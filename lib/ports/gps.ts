import type { GpsProvider, ProviderDeviceLink } from "@prisma/client";

export type GpsPortalContext = Pick<
  ProviderDeviceLink,
  "portalUrl" | "externalAccountRef" | "externalDeviceId" | "provider"
>;

/**
 * GPS / telematics provider contract — Phase 1: portal URLs only, no ingest.
 */
export interface GpsPort {
  readonly provider: GpsProvider;

  resolvePortalUrl(link: GpsPortalContext): string | null;
}
