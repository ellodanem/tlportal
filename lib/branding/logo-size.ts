import type { BrandingLogoSize } from "@prisma/client";

/** Display order in settings (largest first). */
export const BRANDING_LOGO_SIZE_OPTIONS: readonly BrandingLogoSize[] = ["xl", "l", "m", "s"];

export function isBrandingLogoSize(v: string): v is BrandingLogoSize {
  return v === "s" || v === "m" || v === "l" || v === "xl";
}

export function parseBrandingLogoSize(raw: unknown, fallback: BrandingLogoSize = "m"): BrandingLogoSize {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim().toLowerCase();
  return isBrandingLogoSize(t) ? t : fallback;
}

/** Tailwind height classes for branding `<img>` (width stays `w-auto max-w-full`). */
export function brandingLogoHeightClass(size: BrandingLogoSize, collapsed: boolean): string {
  if (collapsed) {
    switch (size) {
      case "xl":
        return "h-14";
      case "l":
        return "h-12";
      case "m":
        return "h-10";
      case "s":
        return "h-8";
    }
  }
  switch (size) {
    case "xl":
      return "h-24";
    case "l":
      return "h-20";
    case "m":
      return "h-16";
    case "s":
      return "h-12";
  }
}
