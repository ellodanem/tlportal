"use server";

import { unlink } from "fs/promises";
import { revalidatePath } from "next/cache";
import path from "path";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

const SETTINGS_ID = "default";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export type BrandingFormState = { ok?: boolean; error?: string };

function publicPathToFs(publicUrl: string): string {
  const relative = publicUrl.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", relative);
}

export async function uploadBrandingLogo(
  _prev: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const file = formData.get("logo");
  if (!file || !(file instanceof File)) {
    return { error: "Choose an image file to upload." };
  }
  if (file.size === 0) {
    return { error: "The file is empty." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Image must be 2 MB or smaller." };
  }
  const mime = file.type || "";
  if (!ALLOWED_TYPES.has(mime)) {
    return { error: "Use PNG, JPEG, WebP, or SVG." };
  }

  const ext =
    mime === "image/png"
      ? "png"
      : mime === "image/jpeg"
        ? "jpg"
        : mime === "image/webp"
          ? "webp"
          : "svg";

  const { mkdir, writeFile, readdir } = await import("fs/promises");
  const dir = path.join(process.cwd(), "public", "uploads", "branding");
  await mkdir(dir, { recursive: true });

  const prev = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { logoUrl: true },
  });
  if (prev?.logoUrl) {
    await unlink(publicPathToFs(prev.logoUrl)).catch(() => {});
  }

  try {
    const existing = await readdir(dir);
    await Promise.all(
      existing
        .filter((name) => name.startsWith("logo."))
        .map((name) => unlink(path.join(dir, name)).catch(() => {})),
    );
  } catch {
    /* ignore */
  }

  const filename = `logo.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), bytes);

  const publicPath = `/uploads/branding/${filename}`;
  await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, logoUrl: publicPath },
    update: { logoUrl: publicPath },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeBrandingLogo(_formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    return;
  }

  const prev = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { logoUrl: true },
  });
  if (prev?.logoUrl) {
    await unlink(publicPathToFs(prev.logoUrl)).catch(() => {});
  }

  await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, logoUrl: null },
    update: { logoUrl: null },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
}
