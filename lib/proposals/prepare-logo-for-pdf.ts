import "server-only";

import sharp from "sharp";

import type { LogoImage } from "@/lib/proposals/pdf";

/** Reject source blobs larger than this before decode (avoids OOM on bad uploads). */
const MAX_SOURCE_BYTES = 12_000_000;

/** Target max bytes for embedded raster after resize/recompress. */
const MAX_EMBED_BYTES = 120_000;

export type PdfLogoBounds = {
  maxWidth: number;
  maxHeight: number;
};

export const PDF_HEADER_LOGO_BOUNDS: PdfLogoBounds = { maxWidth: 280, maxHeight: 96 };

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  try {
    const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

function toLogoImage(buf: Buffer, format: "JPEG" | "PNG"): LogoImage {
  const mime = format === "JPEG" ? "image/jpeg" : "image/png";
  return {
    dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
    format,
  };
}

/**
 * Downscale and recompress logos before jsPDF embeds them.
 * jsPDF stores the full source bitmap — multi‑MB uploads become 100MB+ PDFs without this step.
 */
export async function prepareLogoImageForPdf(
  logo: LogoImage | null | undefined,
  bounds: PdfLogoBounds = PDF_HEADER_LOGO_BOUNDS,
): Promise<LogoImage | null> {
  if (!logo?.dataUrl?.trim()) return null;

  const input = dataUrlToBuffer(logo.dataUrl);
  if (!input || input.length > MAX_SOURCE_BYTES) return null;

  // Already tiny — still run through sharp to strip metadata and normalize format.
  try {
    const base = sharp(input, { failOn: "none" }).rotate().resize(bounds.maxWidth, bounds.maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });

    const meta = await sharp(input).metadata();
    const usePng = Boolean(meta.hasAlpha);

    async function encodeJpeg(quality: number): Promise<Buffer> {
      return base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    }

    async function encodePng(): Promise<Buffer> {
      return base
        .clone()
        .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, colours: 128 })
        .toBuffer();
    }

    let out: Buffer;
    let format: "JPEG" | "PNG";

    if (usePng) {
      out = await encodePng();
      format = "PNG";
      if (out.length > MAX_EMBED_BYTES) {
        const smaller = sharp(input, { failOn: "none" })
          .rotate()
          .resize(Math.round(bounds.maxWidth * 0.7), Math.round(bounds.maxHeight * 0.7), {
            fit: "inside",
            withoutEnlargement: true,
          })
          .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, colours: 96 });
        out = await smaller.toBuffer();
      }
    } else {
      out = await encodeJpeg(82);
      format = "JPEG";
      if (out.length > MAX_EMBED_BYTES) out = await encodeJpeg(68);
      if (out.length > MAX_EMBED_BYTES) out = await encodeJpeg(55);
    }

    if (out.length > MAX_EMBED_BYTES) {
      return null;
    }

    return toLogoImage(out, format);
  } catch {
    return null;
  }
}
