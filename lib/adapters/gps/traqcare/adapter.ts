import type { GpsPort, GpsPortalContext } from "@/lib/ports/gps";

/** Default Traqcare portal when staff has not set a per-device URL. */
const DEFAULT_TRAQCARE_PORTAL = "https://www.traqcare.com/";

export const traqcareGpsAdapter: GpsPort = {
  provider: "traqcare",

  resolvePortalUrl(link: GpsPortalContext): string | null {
    const custom = link.portalUrl?.trim();
    if (custom) {
      return custom;
    }
    return DEFAULT_TRAQCARE_PORTAL;
  },
};
