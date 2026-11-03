import "server-only";

import QRCode from "qrcode";

import { getAppBaseUrl } from "@/lib/stripe/app-url";
import { sanitizeSource } from "@/lib/vehicle/qr-landing";

/** Public URL that the QR code points at, optionally tagged with `?src=`. */
export function getVehiclePageUrl(source?: string | null): string {
  const src = sanitizeSource(source);
  const base = `${getAppBaseUrl()}/vehicle`;
  return src ? `${base}?src=${encodeURIComponent(src)}` : base;
}

const COLORS = { dark: "#023e63", light: "#ffffff" };

/** Vector QR (best for print). Includes the 4-module quiet zone scanners need. */
export function vehicleQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 4,
    color: COLORS,
  });
}

/** High-resolution PNG (about 1200px wide) for pasting into docs/flyers. */
export function vehicleQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "Q",
    margin: 4,
    width: 1200,
    color: COLORS,
  });
}
