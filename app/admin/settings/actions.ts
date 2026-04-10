"use server";

import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import { revalidatePath } from "next/cache";
import path from "path";

import { del, put } from "@vercel/blob";
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

function isBlobLogoUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function blobToken(): string | undefined {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return t || undefined;
}

function useVercelBlob(): boolean {
  return Boolean(blobToken());
}

async function removeStoredBrandingFile(logoUrl: string): Promise<void> {
  if (isBlobLogoUrl(logoUrl)) {
    const token = blobToken();
    if (!token) return;
    await del(logoUrl, { token }).catch(() => {});
    return;
  }
  await unlink(publicPathToFs(logoUrl)).catch(() => {});
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

  const bytes = Buffer.from(await file.arrayBuffer());

  const prev = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { logoUrl: true },
  });
  if (prev?.logoUrl) {
    await removeStoredBrandingFile(prev.logoUrl);
  }

  let logoUrl: string;

  if (useVercelBlob()) {
    const token = blobToken()!;
    const pathname = `branding/${randomUUID()}.${ext}`;
    const blob = await put(pathname, bytes, {
      access: "public",
      token,
    });
    logoUrl = blob.url;
  } else {
    if (process.env.VERCEL === "1") {
      return {
        error:
          "Logo upload on Vercel needs Blob storage. In Vercel: Storage → Blob → create a store (sets BLOB_READ_WRITE_TOKEN), or add that env var manually.",
      };
    }

    const { mkdir, writeFile, readdir } = await import("fs/promises");
    const dir = path.join(process.cwd(), "public", "uploads", "branding");
    await mkdir(dir, { recursive: true });

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
    await writeFile(path.join(dir, filename), bytes);
    logoUrl = `/uploads/branding/${filename}`;
  }

  await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, logoUrl },
    update: { logoUrl },
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
    await removeStoredBrandingFile(prev.logoUrl);
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
