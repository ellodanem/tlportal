"use server";

import { randomUUID } from "crypto";
import type {
  ProposalLineCategory,
  ProposalStatus,
  ProposalVisualKind,
  ProposalVisualLayout,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "path";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { buildDefaultProposalNestedCreate } from "@/lib/proposals/default-draft";

export type SaveProposalState = { error?: string; ok?: boolean };

export type UploadProposalVisualImageState = { error?: string; ok?: boolean; url?: string };

const VISUAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** PNG/JPEG at or below this size are stored as `data:image/...;base64,...` in `imageUrl` so PDF export never depends on disk paths or HTTP. */
const VISUAL_IMAGE_INLINE_MAX_BYTES = 2.5 * 1024 * 1024;
const VISUAL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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

const LINE_CATEGORIES: ProposalLineCategory[] = [
  "hardware",
  "subscription",
  "installation",
  "service",
  "other",
];

function parseCategory(raw: string): ProposalLineCategory {
  const s = raw.trim().toLowerCase();
  return (LINE_CATEGORIES as readonly string[]).includes(s) ? (s as ProposalLineCategory) : "other";
}

function parseLineItemsJson(raw: string): Array<{
  category: ProposalLineCategory;
  description: string;
  quantity: number;
  unitLabel: string | null;
  unitPrice: number;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Line items must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Line items must be an array.");
  }
  return parsed.map((row, i) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Line item ${i + 1} is invalid.`);
    }
    const r = row as Record<string, unknown>;
    const description = String(r.description ?? "").trim();
    if (!description) {
      throw new Error(`Line item ${i + 1} needs a description.`);
    }
    const qty = Number(r.quantity ?? 1);
    const price = Number(r.unitPrice ?? 0);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new Error(`Line item ${i + 1} has an invalid quantity.`);
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Line item ${i + 1} has an invalid unit price.`);
    }
    const unitLabelRaw = String(r.unitLabel ?? "").trim();
    return {
      category: parseCategory(String(r.category ?? "other")),
      description,
      quantity: qty,
      unitLabel: unitLabelRaw.length ? unitLabelRaw : null,
      unitPrice: price,
    };
  });
}

function parseVisualKind(raw: unknown): ProposalVisualKind {
  const s = String(raw ?? "media").toLowerCase();
  return s === "timeline" ? "timeline" : "media";
}

function parseVisualLayout(raw: unknown): ProposalVisualLayout {
  const s = String(raw ?? "full_width").toLowerCase();
  if (s === "half_width" || s === "half") return "half_width";
  return "full_width";
}

function parseVisualsJson(raw: string): Array<{
  title: string;
  caption: string | null;
  imageUrl: string | null;
  placeholderHint: string | null;
  imageAlt: string | null;
  kind: ProposalVisualKind;
  layout: ProposalVisualLayout;
  timelineSteps: { title: string; detail: string }[];
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Visual blocks must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Visual blocks must be an array.");
  }
  return parsed.map((row, i) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Visual ${i + 1} is invalid.`);
    }
    const r = row as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    if (!title) {
      throw new Error(`Visual ${i + 1} needs a title.`);
    }
    const caption = String(r.caption ?? "").trim();
    const imageUrl = String(r.imageUrl ?? "").trim();
    const placeholderHint = String(r.placeholderHint ?? "").trim();
    const imageAlt = String(r.imageAlt ?? "").trim();
    const kind = parseVisualKind(r.kind);
    let layout = parseVisualLayout(r.layout);
    if (kind === "timeline") {
      layout = "full_width";
    }

    let timelineSteps: { title: string; detail: string }[] = [];
    if (r.timelineSteps != null) {
      if (!Array.isArray(r.timelineSteps)) {
        throw new Error(`Visual ${i + 1}: timeline steps must be an array.`);
      }
      timelineSteps = r.timelineSteps
        .map((step, j) => {
          if (!step || typeof step !== "object") {
            throw new Error(`Visual ${i + 1} step ${j + 1} is invalid.`);
          }
          const st = step as Record<string, unknown>;
          const stTitle = String(st.title ?? "").trim();
          const detail = String(st.detail ?? "").trim();
          return { title: stTitle, detail };
        })
        .filter((s) => s.title.length > 0)
        .slice(0, 8);
    }
    if (kind === "timeline" && timelineSteps.length === 0) {
      throw new Error(`Visual ${i + 1}: timeline blocks need at least one step with a title.`);
    }

    return {
      title,
      caption: caption.length ? caption : null,
      imageUrl: imageUrl.length ? imageUrl : null,
      placeholderHint: placeholderHint.length ? placeholderHint : null,
      imageAlt: imageAlt.length ? imageAlt : null,
      kind,
      layout,
      timelineSteps,
    };
  });
}

function readOptionalText(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v.length ? v : null;
}

function readText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Upload a PNG/JPEG/WebP for a proposal visual block. Returns a path (`/uploads/proposals/...`) or Blob URL. Client should set `imageUrl` and save the proposal. */
export async function uploadProposalVisualImage(
  formData: FormData,
): Promise<UploadProposalVisualImageState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return { error: "Choose an image file." };
  }
  if (file.size === 0) {
    return { error: "The file is empty." };
  }
  if (file.size > VISUAL_IMAGE_MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }
  const mime = file.type || "";
  if (!VISUAL_IMAGE_TYPES.has(mime)) {
    return { error: "Use PNG, JPEG, or WebP." };
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const bytes = Buffer.from(await file.arrayBuffer());
  const previousUrl = String(formData.get("previousUrl") ?? "").trim();

  let imageUrl: string;
  try {
    if (previousUrl.startsWith("/uploads/proposals/")) {
      const { unlink } = await import("fs/promises");
      const rel = previousUrl.replace(/^\/+/, "");
      await unlink(path.join(process.cwd(), "public", rel)).catch(() => {});
    }

    if (useVercelBlob()) {
      const { put } = await import("@vercel/blob");
      const token = blobToken()!;
      const pathname = `proposals/${randomUUID()}.${ext}`;
      const putOpts = { token, contentType: mime || undefined } as const;
      try {
        const blob = await put(pathname, bytes, { ...putOpts, access: "public" as const });
        imageUrl = blob.url;
      } catch (e) {
        if (!isVercelBlobPrivateStorePublicAccessError(e)) throw e;
        const blob = await put(pathname, bytes, { ...putOpts, access: "private" as const });
        imageUrl = blob.url;
      }
    } else {
      if (process.env.VERCEL === "1") {
        return {
          error:
            "Image upload on Vercel needs Vercel Blob (BLOB_READ_WRITE_TOKEN). Or paste a full https:// image URL.",
        };
      }

      const { mkdir, writeFile } = await import("fs/promises");
      const dir = path.join(process.cwd(), "public", "uploads", "proposals");
      await mkdir(dir, { recursive: true });
      const filename = `${randomUUID()}.${ext}`;
      await writeFile(path.join(dir, filename), bytes);

      const canInline =
        bytes.length <= VISUAL_IMAGE_INLINE_MAX_BYTES &&
        (mime === "image/png" || mime === "image/jpeg");
      if (canInline) {
        const mimePart = mime === "image/png" ? "image/png" : "image/jpeg";
        imageUrl = `data:${mimePart};base64,${bytes.toString("base64")}`;
      } else {
        imageUrl = `/uploads/proposals/${filename}`;
      }
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { error: `Upload failed: ${raw.slice(0, 240)}${raw.length > 240 ? "…" : ""}` };
  }

  return { ok: true, url: imageUrl };
}

export async function createProposal(): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const proposal = await prisma.proposal.create({
    data: buildDefaultProposalNestedCreate(session.sub),
  });

  redirect(`/admin/proposals/${proposal.id}`);
}

export async function saveProposal(formData: FormData): Promise<SaveProposalState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = readText(formData, "proposalId");
  if (!id) {
    return { error: "Missing proposal id." };
  }

  const title = readText(formData, "title");
  if (!title) {
    return { error: "Title is required." };
  }

  const customerIdRaw = readText(formData, "customerId");
  const customerId = customerIdRaw.length ? customerIdRaw : null;

  const validityDays = Math.min(365, Math.max(1, parseInt(readText(formData, "validityDays") || "14", 10) || 14));

  const statusRaw = readText(formData, "status");
  const status: ProposalStatus = statusRaw === "sent" ? "sent" : "draft";

  const currencyCode = (readText(formData, "currencyCode") || "XCD").slice(0, 8).toUpperCase() || "XCD";

  let lineItems;
  let visuals;
  try {
    lineItems = parseLineItemsJson(readText(formData, "lineItemsJson"));
    visuals = parseVisualsJson(readText(formData, "visualsJson"));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid form data.";
    return { error: message };
  }

  const existing = await prisma.proposal.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return { error: "Proposal not found." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.proposal.update({
        where: { id },
        data: {
          title,
          status,
          customerId,
          clientLabel: readOptionalText(formData, "clientLabel"),
          clientCompany: readOptionalText(formData, "clientCompany"),
          clientContactName: readOptionalText(formData, "clientContactName"),
          clientEmail: readOptionalText(formData, "clientEmail"),
          clientPhone: readOptionalText(formData, "clientPhone"),
          clientAddress: readOptionalText(formData, "clientAddress"),
          executiveSummary: readOptionalText(formData, "executiveSummary"),
          includedFeatures: readOptionalText(formData, "includedFeatures"),
          assumptionsText: readOptionalText(formData, "assumptionsText"),
          nextStepsText: readOptionalText(formData, "nextStepsText"),
          termsText: readOptionalText(formData, "termsText"),
          pricingFootnote: readOptionalText(formData, "pricingFootnote"),
          currencyCode,
          validityDays,
          salesContactName: readOptionalText(formData, "salesContactName"),
          salesContactTitle: readOptionalText(formData, "salesContactTitle"),
          salesContactEmail: readOptionalText(formData, "salesContactEmail"),
          salesContactPhone: readOptionalText(formData, "salesContactPhone"),
        },
      });

      await tx.proposalLineItem.deleteMany({ where: { proposalId: id } });
      if (lineItems.length) {
        await tx.proposalLineItem.createMany({
          data: lineItems.map((row, sortOrder) => ({
            proposalId: id,
            sortOrder,
            category: row.category,
            description: row.description,
            quantity: row.quantity,
            unitLabel: row.unitLabel,
            unitPrice: row.unitPrice,
          })),
        });
      }

      await tx.proposalVisualBlock.deleteMany({ where: { proposalId: id } });
      if (visuals.length) {
        await tx.proposalVisualBlock.createMany({
          data: visuals.map((row, sortOrder) => ({
            proposalId: id,
            sortOrder,
            title: row.title,
            caption: row.caption,
            imageUrl: row.imageUrl,
            placeholderHint: row.placeholderHint,
            imageAlt: row.imageAlt,
            kind: row.kind,
            layout: row.layout,
            timelineSteps:
              row.kind === "timeline" && row.timelineSteps.length > 0
                ? (row.timelineSteps as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
          })),
        });
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save proposal.";
    return { error: message };
  }

  revalidatePath("/admin/proposals");
  revalidatePath(`/admin/proposals/${id}`);
  return { ok: true };
}

export async function deleteProposal(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const id = readText(formData, "proposalId");
  if (!id) {
    redirect("/admin/proposals");
  }

  await prisma.proposal.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/proposals");
  redirect("/admin/proposals");
}
