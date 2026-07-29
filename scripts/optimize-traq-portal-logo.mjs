/**
 * Optimize Traq Portal draft logo: trim canvas, compress, export web + icon sizes.
 * Source: public/logo-drafts/traq-portal-draft1.png (JPEG in .png extension).
 *
 * Usage: node scripts/optimize-traq-portal-logo.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "public/logo-drafts/traq-portal-draft1.png");
const outDir = path.join(root, "public/logo-drafts/optimized");
const iconDir = path.join(outDir, "icon");

/** Padding around trimmed wordmark inside square app icons (fraction of box). */
const ICON_PAD = 0.14;

async function squareIconPng(trimmedBuffer, size) {
  const meta = await sharp(trimmedBuffer).metadata();
  const w = meta.width ?? size;
  const h = meta.height ?? size;
  const inner = Math.round(size * (1 - ICON_PAD * 2));
  const scale = Math.min(inner / w, inner / h);
  const logoW = Math.round(w * scale);
  const logoH = Math.round(h * scale);
  const left = Math.round((size - logoW) / 2);
  const top = Math.round((size - logoH) / 2);

  const pngOpts = { compressionLevel: 9, adaptiveFiltering: true, palette: true, colours: 128 };

  const resized = await sharp(trimmedBuffer)
    .resize(logoW, logoH, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .png(pngOpts)
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png(pngOpts)
    .toBuffer();
}

async function main() {
  await mkdir(iconDir, { recursive: true });

  const trimmed = await sharp(src)
    .rotate()
    .trim({ threshold: 10 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });

  const { data: trimmedBuf, info } = trimmed;
  console.log(`Trimmed wordmark: ${info.width}×${info.height}`);

  const pngOpts = { compressionLevel: 9, adaptiveFiltering: true, palette: true, colours: 128 };
  const jpegOpts = { quality: 92, mozjpeg: true };

  const writes = [];

  // Primary web asset (dark backgrounds): trimmed JPEG is much smaller than PNG.
  writes.push(
    sharp(trimmedBuf).jpeg(jpegOpts).toFile(path.join(outDir, "traq-portal-logo.jpg")),
    sharp(trimmedBuf).webp({ quality: 92, effort: 6 }).toFile(path.join(outDir, "traq-portal-logo.webp")),
    sharp(trimmedBuf).png(pngOpts).toFile(path.join(outDir, "traq-portal-logo.png")),
  );

  for (const width of [640, 320, 160]) {
    const target = Math.min(width, info.width);
    if (target === info.width) continue;
    writes.push(
      sharp(trimmedBuf)
        .resize(target, null, { fit: "inside", withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
        .jpeg(jpegOpts)
        .toFile(path.join(outDir, `traq-portal-logo-${target}.jpg`)),
      sharp(trimmedBuf)
        .resize(target, null, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90, effort: 6 })
        .toFile(path.join(outDir, `traq-portal-logo-${target}.webp`)),
    );
  }

  for (const size of [1024, 512, 192, 180, 32]) {
    const buf = await squareIconPng(trimmedBuf, size);
    writes.push(writeFile(path.join(iconDir, `icon-${size}.png`), buf));
  }

  await Promise.all(writes);

  const manifest = {
    source: "public/logo-drafts/traq-portal-draft1.png",
    trimmed: { width: info.width, height: info.height },
    preferredWeb: "traq-portal-logo.webp",
    preferredDarkUi: "traq-portal-logo.jpg",
    brandGreen: "#4CAF50",
    background: "#000000",
    iconPadding: ICON_PAD,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Wrote assets to ${path.relative(root, outDir)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
