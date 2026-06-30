import "server-only";

import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

import { del, put } from "@vercel/blob";

export const EXPENSE_RECEIPT_PRIVATE_PREFIX = "private:" as const;

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

function blobToken(): string | undefined {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return t || undefined;
}

function useVercelBlob(): boolean {
  return Boolean(blobToken());
}

function isVercelBlobPrivateStorePublicAccessError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes("Cannot use public access on a private store");
}

function stripPrivatePrefix(stored: string): string {
  return stored.startsWith(EXPENSE_RECEIPT_PRIVATE_PREFIX)
    ? stored.slice(EXPENSE_RECEIPT_PRIVATE_PREFIX.length)
    : stored;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

export async function uploadExpenseReceipt(file: File): Promise<{ path: string } | { error: string }> {
  if (!file.size) return { error: "Choose a receipt file to upload." };
  if (file.size > MAX_BYTES) return { error: "Receipt must be 8 MB or smaller." };

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(mime)) {
    return { error: "Receipt must be PDF, PNG, JPEG, or WebP." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = extFromMime(mime);

  try {
    if (useVercelBlob()) {
      const token = blobToken()!;
      const pathname = `expenses/${randomUUID()}.${ext}`;
      const putOpts = { token, contentType: mime } as const;
      try {
        const blob = await put(pathname, bytes, { ...putOpts, access: "public" as const });
        return { path: blob.url };
      } catch (e) {
        if (!isVercelBlobPrivateStorePublicAccessError(e)) throw e;
        const blob = await put(pathname, bytes, { ...putOpts, access: "private" as const });
        return { path: `${EXPENSE_RECEIPT_PRIVATE_PREFIX}${blob.url}` };
      }
    }

    if (process.env.VERCEL === "1") {
      return { error: "Receipt upload on Vercel requires BLOB_READ_WRITE_TOKEN." };
    }

    const dir = path.join(process.cwd(), "public", "uploads", "expenses");
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await writeFile(path.join(dir, filename), bytes);
    return { path: `/uploads/expenses/${filename}` };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { error: `Upload failed: ${raw.slice(0, 240)}` };
  }
}

export async function loadExpenseReceiptBytes(storedPath: string): Promise<Buffer | null> {
  const token = blobToken();

  if (storedPath.startsWith(EXPENSE_RECEIPT_PRIVATE_PREFIX)) {
    if (!token) return null;
    const { get } = await import("@vercel/blob");
    const blobUrl = stripPrivatePrefix(storedPath);
    const out = await get(blobUrl, { access: "private", token });
    if (!out || out.statusCode !== 200 || !out.stream) return null;
    return Buffer.from(await new Response(out.stream).arrayBuffer());
  }

  if (storedPath.startsWith("http://") || storedPath.startsWith("https://")) {
    try {
      const res = await fetch(storedPath, { cache: "no-store" });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  if (storedPath.startsWith("/uploads/")) {
    try {
      const { readFile } = await import("fs/promises");
      const rel = storedPath.replace(/^\/+/, "");
      return await readFile(path.join(process.cwd(), "public", rel));
    } catch {
      return null;
    }
  }

  return null;
}

export function expenseReceiptContentType(storedPath: string): string {
  const lower = storedPath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function removeExpenseReceipt(storedPath: string | null | undefined): Promise<void> {
  if (!storedPath) return;

  const token = blobToken();
  const blobTarget = stripPrivatePrefix(storedPath);

  if (blobTarget.startsWith("http://") || blobTarget.startsWith("https://")) {
    if (token) await del(blobTarget, { token }).catch(() => {});
    return;
  }

  if (storedPath.startsWith("/uploads/")) {
    const rel = storedPath.replace(/^\/+/, "");
    await unlink(path.join(process.cwd(), "public", rel)).catch(() => {});
  }
}
