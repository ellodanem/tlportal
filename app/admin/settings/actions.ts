"use server";

import { unlink } from "fs/promises";
import { revalidatePath } from "next/cache";
import path from "path";

import type { Prisma } from "@prisma/client";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

const SETTINGS_ID = "default";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export type BrandingFormState = { ok?: boolean; error?: string };

export type SmtpSettingsFormState = { ok?: boolean; error?: string };

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

function parseSmtpPort(raw: FormDataEntryValue | null): number {
  if (typeof raw !== "string") return 587;
  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) return 587;
  return Math.min(65535, Math.max(1, n));
}

export async function updateSmtpSettings(
  _prev: SmtpSettingsFormState,
  formData: FormData,
): Promise<SmtpSettingsFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const host = (formData.get("smtpHost") as string)?.trim() || "";
  const smtpSecure = formData.get("smtpSecure") === "on";
  const user = (formData.get("smtpUser") as string)?.trim() || "";
  const fromEmail = (formData.get("smtpFromEmail") as string)?.trim() || "";
  const fromName = (formData.get("smtpFromName") as string)?.trim() || "";
  const passwordRaw = formData.get("smtpPassword");
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const clearPassword = formData.get("smtpClearPassword") === "on";

  if (!host) {
    await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        smtpHost: null,
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: null,
        smtpPassword: null,
        smtpFromEmail: null,
        smtpFromName: null,
      },
      update: {
        smtpHost: null,
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: null,
        smtpPassword: null,
        smtpFromEmail: null,
        smtpFromName: null,
      },
    });
    revalidatePath("/admin/settings");
    return { ok: true };
  }

  const port = parseSmtpPort(formData.get("smtpPort"));

  const updateData: Prisma.AppSettingsUpdateInput = {
    smtpHost: host,
    smtpPort: port,
    smtpSecure,
    smtpUser: user || null,
    smtpFromEmail: fromEmail || null,
    smtpFromName: fromName || null,
  };
  if (clearPassword) {
    updateData.smtpPassword = null;
  } else if (password.trim()) {
    updateData.smtpPassword = password.trim();
  }

  await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      smtpHost: host,
      smtpPort: port,
      smtpSecure,
      smtpUser: user || null,
      smtpPassword: clearPassword ? null : password.trim() || null,
      smtpFromEmail: fromEmail || null,
      smtpFromName: fromName || null,
    },
    update: updateData,
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}
